import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { UserModel } from '../models/user.model';
import { EmployeeModel } from '../models/employee.model';
import { ActivityLogModel } from '../models/activityLog.model';
import { OfficeModel } from '../models/office.model';
import { env } from '../config/env';
import type { AuthRequest } from '../middleware/auth';
import { ADMIN_ROLES } from '../middleware/authorize';
import {
  OFFICE_ADMIN_ROLE_VALUES,
  buildUserRoleMatchFilter,
  hasRoleCapability,
  assertKnownRole,
  normalizeRoles,
  resolveActiveRole,
  resolveRuntimeRole,
} from '../utils/roles';
import { validateStrongPassword } from '../utils/passwordPolicy';

type RequestWithCookies = Request & { cookies?: Record<string, string> };

function signToken(user: {
  id: string;
  email: string;
  role?: string;
  activeRole?: string;
  roles?: string[];
  locationId?: string | null;
  tokenVersion: number;
}) {
  const normalizedRoles = normalizeRoles(user.roles, user.activeRole || user.role || 'employee');
  const activeRole = resolveActiveRole(user.activeRole || user.role || 'employee', normalizedRoles);
  const runtimeRole = resolveRuntimeRole(activeRole);
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: runtimeRole,
      activeRole,
      roles: normalizedRoles,
      locationId: user.locationId || null,
      isOrgAdmin: hasRoleCapability(normalizedRoles, ['org_admin']),
      tokenVersion: Number(user.tokenVersion || 0),
    },
    env.jwtSecret as jwt.Secret,
    { expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'] }
  );
}

function parseExpiresToMs(input: string) {
  const normalized = String(input || '').trim();
  const plain = Number(normalized);
  if (Number.isFinite(plain) && plain > 0) {
    return plain * 1000;
  }
  const match = normalized.match(/^(\d+)([smhd])$/i);
  if (!match) {
    return 7 * 24 * 60 * 60 * 1000;
  }
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  return value * multiplier;
}

function setAuthCookie(res: Response, token: string) {
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: parseExpiresToMs(env.jwtExpiresIn),
  });
}

function setCsrfCookie(res: Response, csrfToken: string) {
  res.cookie('csrf_token', csrfToken, {
    httpOnly: false,
    secure: env.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: parseExpiresToMs(env.jwtExpiresIn),
  });
}

function createCsrfToken() {
  return crypto.randomBytes(24).toString('hex');
}

function setSessionCookies(res: Response, token: string) {
  setAuthCookie(res, token);
  const csrfToken = createCsrfToken();
  setCsrfCookie(res, csrfToken);
  res.setHeader('x-csrf-token', csrfToken);
}

function clearSessionCookies(res: Response) {
  res.clearCookie('auth_token', {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'lax',
  });
  res.clearCookie('csrf_token', {
    httpOnly: false,
    secure: env.nodeEnv === 'production',
    sameSite: 'lax',
  });
}

function hashResetToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

function readStringInput(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function readTrimmedString(value: unknown) {
  return readStringInput(value).trim();
}

function readNormalizedEmail(value: unknown) {
  return readTrimmedString(value).toLowerCase();
}

function resolveLockoutUntil(user: { lockout_until?: Date | string | null } | null) {
  const lockout = user?.lockout_until ? new Date(user.lockout_until) : null;
  if (!lockout || Number.isNaN(lockout.getTime())) {
    return null;
  }
  return lockout;
}

function calculateLockoutMinutes(attempts: number) {
  const threshold = env.authLockoutThreshold;
  if (attempts < threshold) return 0;
  const step = Math.floor((attempts - threshold) / threshold);
  const duration = env.authLockoutBaseMinutes * Math.pow(2, step);
  return Math.min(duration, env.authLockoutMaxMinutes);
}

function ensureCsrfCookie(req: Request, res: Response) {
  const currentToken = (req as RequestWithCookies).cookies?.csrf_token;
  if (currentToken) return;
  const csrfToken = createCsrfToken();
  setCsrfCookie(res, csrfToken);
  res.setHeader('x-csrf-token', csrfToken);
}

async function validateLocationId(locationId: string | null | undefined) {
  const normalized = readTrimmedString(locationId);
  if (!normalized) return null;
  const office = await OfficeModel.findOne({ _id: normalized, is_active: { $ne: false } }, { _id: 1 }).lean();
  if (!(office as { _id?: unknown } | null)?._id) {
    throw new Error('Assigned office was not found or is inactive');
  }
  return normalized;
}

function ensureEmployeeRolesHaveLocation(roles: string[], locationId: string | null) {
  if (hasRoleCapability(roles, ['employee']) && !locationId) {
    throw new Error('Employee-role users must be assigned to an office');
  }
}

async function ensureEmployeeProfileForUser(input: {
  userId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  locationId?: string | null;
}) {
  const normalizedEmail = readNormalizedEmail(input.email);
  if (!normalizedEmail) return;

  const existing = await EmployeeModel.findOne({
    $or: [
      { user_id: input.userId },
      { email: { $regex: `^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
    ],
  });

  if (existing) {
    existing.user_id = input.userId as any;
    existing.email = normalizedEmail;
    if (!existing.first_name && input.firstName) existing.first_name = input.firstName;
    if (!existing.last_name && input.lastName) existing.last_name = input.lastName;
    if (input.locationId !== undefined) existing.location_id = input.locationId || null;
    if (existing.is_active === false) existing.is_active = true;
    await existing.save();
    return;
  }

  await EmployeeModel.create({
    user_id: input.userId,
    email: normalizedEmail,
    first_name: readTrimmedString(input.firstName) || 'Employee',
    last_name: readTrimmedString(input.lastName) || 'User',
    location_id: input.locationId || null,
    is_active: true,
  });
}

export const authController = {
  register: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user || !ADMIN_ROLES.has(req.user.role)) {
        return res.status(403).json({ message: 'Self-registration is disabled' });
      }
      const { email, password, firstName, lastName, role, roles, activeRole, locationId } = req.body as {
        email: string;
        password: string;
        firstName?: string;
        lastName?: string;
        role?: string;
        roles?: string[];
        activeRole?: string;
        locationId?: string;
      };

      const normalizedEmail = readNormalizedEmail(email);
      const normalizedPassword = readStringInput(password);
      if (!normalizedEmail || !normalizedPassword) {
        return res.status(400).json({ message: 'Email and password are required' });
      }
      const passwordValidationError = validateStrongPassword(normalizedPassword);
      if (passwordValidationError) {
        return res.status(400).json({ message: passwordValidationError });
      }

      const existing = await UserModel.findOne({ email: normalizedEmail });
      if (existing) return res.status(409).json({ message: 'Email already in use' });

      const passwordHash = await bcrypt.hash(normalizedPassword, 10);
      const requestedRoleInput = readTrimmedString(role);
      if (requestedRoleInput) {
        assertKnownRole(requestedRoleInput);
      }
      const requestedRole = requestedRoleInput || 'employee';
      const requestedRoles = Array.isArray(roles) ? roles.filter((entry): entry is string => typeof entry === 'string') : undefined;
      if (Array.isArray(requestedRoles) && requestedRoles.some((entry) => !entry || entry.trim().length === 0)) {
        return res.status(400).json({ message: 'Invalid role list' });
      }
      if (Array.isArray(requestedRoles)) {
        requestedRoles.forEach((entry) => assertKnownRole(entry));
      }
      const requestedActiveRole = readTrimmedString(activeRole);
      if (requestedActiveRole) {
        assertKnownRole(requestedActiveRole);
      }
      const normalizedRoles = normalizeRoles(requestedRoles, requestedRole);
      const normalizedActiveRole = resolveActiveRole(requestedActiveRole || requestedRole || normalizedRoles[0], normalizedRoles);
      if (hasRoleCapability(normalizedRoles, ['org_admin']) && !req.user.isOrgAdmin) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      let validatedLocationId: string | null = null;
      try {
        validatedLocationId = await validateLocationId(locationId || null);
        ensureEmployeeRolesHaveLocation(normalizedRoles, validatedLocationId);
      } catch (validationError) {
        return res.status(400).json({ message: (validationError as Error).message });
      }
      const user = await UserModel.create({
        email: normalizedEmail,
        password_hash: passwordHash,
        first_name: firstName || null,
        last_name: lastName || null,
        role: normalizedActiveRole,
        roles: normalizedRoles,
        active_role: normalizedActiveRole,
        location_id: validatedLocationId,
      });

      if (hasRoleCapability(normalizedRoles, ['employee'])) {
        await ensureEmployeeProfileForUser({
          userId: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          locationId: user.location_id ? String(user.location_id) : null,
        });
      }

      res.status(201).json({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: resolveRuntimeRole(normalizedActiveRole),
          activeRole: normalizedActiveRole,
          roles: normalizedRoles,
        },
      });
    } catch (error) {
      next(error);
    }
  },
  login: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body as { email: string; password: string };
      if (typeof email !== 'string' || typeof password !== 'string') {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      const normalizedEmail = readNormalizedEmail(email);
      if (!normalizedEmail || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
      }

      const user = await UserModel.findOne({ email: normalizedEmail });
      if (!user) return res.status(401).json({ message: 'Invalid credentials' });
      if (user.is_active === false) return res.status(403).json({ message: 'Account is disabled' });

      const lockoutUntil = resolveLockoutUntil(user);
      if (lockoutUntil && lockoutUntil.getTime() > Date.now()) {
        return res.status(429).json({ message: 'Account is temporarily locked. Please try again later.' });
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        const attempts = Number(user.failed_login_attempts || 0) + 1;
        const lockoutMinutes = calculateLockoutMinutes(attempts);
        user.failed_login_attempts = attempts;
        user.lockout_until = lockoutMinutes > 0 ? new Date(Date.now() + lockoutMinutes * 60_000) : null;
        await user.save();
        if (lockoutMinutes > 0) {
          return res.status(429).json({ message: 'Account is temporarily locked. Please try again later.' });
        }
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const normalizedRoles = normalizeRoles(user.roles, user.role);
      const activeRole = resolveActiveRole(user.active_role || user.role, normalizedRoles);
      if (user.role !== activeRole) {
        user.role = activeRole;
      }
      const currentRoles = normalizeRoles(user.roles, user.role, { allowEmpty: true });
      const hasRolesChanged =
        currentRoles.length !== normalizedRoles.length
        || currentRoles.some((entry) => !normalizedRoles.includes(entry));
      if (hasRolesChanged) {
        user.roles = normalizedRoles;
      }
      if (user.active_role !== activeRole) {
        user.active_role = activeRole;
      }
      user.last_login_at = new Date().toISOString();
      user.failed_login_attempts = 0;
      user.lockout_until = null;
      await user.save();

      const token = signToken({
        id: user.id,
        email: user.email,
        activeRole,
        roles: normalizedRoles,
        locationId: user.location_id ? user.location_id.toString() : null,
        tokenVersion: Number(user.token_version || 0),
      });
      setSessionCookies(res, token);
      res.json({
        token: undefined,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: resolveRuntimeRole(activeRole),
          activeRole,
          roles: normalizedRoles,
        },
      });
    } catch (error) {
      next(error);
    }
  },
  me: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const user = await UserModel.findById(userId);
      if (!user) return res.status(404).json({ message: 'Not found' });

      ensureCsrfCookie(req, res);
      const normalizedRoles = normalizeRoles(user.roles, user.role);
      const activeRole = resolveActiveRole(user.active_role || user.role, normalizedRoles);
      res.json({
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: resolveRuntimeRole(activeRole),
        activeRole,
        roles: normalizedRoles,
        locationId: user.location_id,
      });
    } catch (error) {
      next(error);
    }
  },
  requestPasswordReset: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.body as { email: string };
      const normalizedEmail = readNormalizedEmail(email);

      if (!normalizedEmail) {
        return res.status(200).json({ message: 'Request received' });
      }

      const requester = await UserModel.findOne({ email: normalizedEmail });
      const employee = requester
        ? await EmployeeModel.findOne({ user_id: requester.id })
        : await EmployeeModel.findOne({ email: normalizedEmail });

      let resetToken: string | null = null;
      if (requester && requester.is_active !== false) {
        resetToken = createResetToken();
        requester.password_reset_token_hash = hashResetToken(resetToken);
        requester.password_reset_expires_at = new Date(Date.now() + env.passwordResetTokenTtlMinutes * 60_000);
        requester.password_reset_requested_at = new Date();
        await requester.save();
      }

      const requesterLocationId = requester?.location_id || employee?.location_id || null;
      const requesterDirectorateId = employee?.directorate_id || null;

      const adminUsers = await UserModel.find(buildUserRoleMatchFilter(['org_admin']));
      const locationAdminUsers = await UserModel.find(
        buildUserRoleMatchFilter([...OFFICE_ADMIN_ROLE_VALUES])
      );
      const globalAdmins = adminUsers.filter((admin) => !admin.location_id);
      const locationAdmins = requesterLocationId
        ? [
            ...adminUsers.filter((admin) => admin.location_id?.toString() === requesterLocationId.toString()),
            ...locationAdminUsers.filter((admin) => admin.location_id?.toString() === requesterLocationId.toString()),
          ]
        : [];

      const directorateHeads = requesterDirectorateId
        ? await UserModel.find(buildUserRoleMatchFilter(['office_head']))
        : [];

      let matchedDirectorateHeads: typeof directorateHeads = [];
      if (requesterDirectorateId && directorateHeads.length > 0) {
        const headIds = directorateHeads.map((user) => user.id);
        const headEmployees = await EmployeeModel.find({
          user_id: { $in: headIds },
          directorate_id: requesterDirectorateId,
        });
        const headIdSet = new Set(headEmployees.map((emp) => emp.user_id?.toString()));
        matchedDirectorateHeads = directorateHeads.filter((user) => headIdSet.has(user.id));
      }

      const recipients = new Map<string, (typeof adminUsers)[number]>();
      globalAdmins.forEach((admin) => recipients.set(admin.id, admin));
      locationAdmins.forEach((admin) => recipients.set(admin.id, admin));
      matchedDirectorateHeads.forEach((head) => recipients.set(head.id, head));

      if (recipients.size === 0 && adminUsers.length > 0) {
        adminUsers.forEach((admin) => recipients.set(admin.id, admin));
      }

      const description = `Password reset requested for ${normalizedEmail}`;
      const metadata = {
        requestedEmail: normalizedEmail,
        requesterUserId: requester?.id || null,
        locationId: requesterLocationId || null,
        directorateId: requesterDirectorateId || null,
      };

      const entries = Array.from(recipients.values()).map((recipient) => ({
        user_id: recipient.id,
        activity_type: 'password_reset_request',
        description,
        metadata,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'] || null,
      }));

      if (entries.length > 0) {
        await ActivityLogModel.insertMany(entries);
      }

      if (env.nodeEnv === 'test' && resetToken) {
        return res.status(200).json({
          message: 'Request received',
          resetToken,
          expiresInMinutes: env.passwordResetTokenTtlMinutes,
        });
      }
      return res.status(200).json({ message: 'Request received' });
    } catch (error) {
      next(error);
    }
  },
  resetPassword: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token, newPassword } = req.body as { token?: string; newPassword?: string };
      const normalizedToken = readTrimmedString(token);
      const normalizedPassword = readStringInput(newPassword);

      if (!normalizedToken || !normalizedPassword) {
        return res.status(400).json({ message: 'Token and newPassword are required' });
      }

      const passwordValidationError = validateStrongPassword(normalizedPassword);
      if (passwordValidationError) {
        return res.status(400).json({ message: passwordValidationError });
      }

      const tokenHash = hashResetToken(normalizedToken);
      const now = new Date();
      const candidate = await UserModel.findOne({
        password_reset_token_hash: tokenHash,
        password_reset_expires_at: { $gt: now },
      });
      if (!candidate) {
        return res.status(400).json({ message: 'Invalid or expired reset token' });
      }

      const passwordHash = await bcrypt.hash(normalizedPassword, 10);
      const nextTokenVersion = Number(candidate.token_version || 0) + 1;
      const updateResult = await UserModel.updateOne(
        {
          _id: candidate.id,
          password_reset_token_hash: tokenHash,
          password_reset_expires_at: { $gt: now },
        },
        {
          $set: {
            password_hash: passwordHash,
            last_password_change_at: new Date().toISOString(),
            token_version: nextTokenVersion,
            failed_login_attempts: 0,
            lockout_until: null,
            password_reset_token_hash: null,
            password_reset_expires_at: null,
            password_reset_requested_at: null,
          },
        }
      );

      if (!updateResult.modifiedCount) {
        return res.status(400).json({ message: 'Invalid or expired reset token' });
      }

      return res.json({ message: 'Password reset successful' });
    } catch (error) {
      next(error);
    }
  },
  changePassword: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const { oldPassword, newPassword } = req.body as {
        oldPassword?: string;
        newPassword?: string;
      };
      const normalizedOldPassword = readStringInput(oldPassword);
      const normalizedNewPassword = readStringInput(newPassword);

      if (!normalizedOldPassword || !normalizedNewPassword) {
        return res.status(400).json({ message: 'Missing password fields' });
      }

      const passwordValidationError = validateStrongPassword(normalizedNewPassword);
      if (passwordValidationError) {
        return res.status(400).json({ message: passwordValidationError });
      }
      if (normalizedOldPassword === normalizedNewPassword) {
        return res.status(400).json({ message: 'New password must be different from current password' });
      }

      const user = await UserModel.findById(userId);
      if (!user) return res.status(404).json({ message: 'Not found' });

      const valid = await bcrypt.compare(normalizedOldPassword, user.password_hash);
      if (!valid) return res.status(400).json({ message: 'Current password is incorrect' });

      const passwordHash = await bcrypt.hash(normalizedNewPassword, 10);
      const nextTokenVersion = Number(user.token_version || 0) + 1;
      user.password_hash = passwordHash;
      user.last_password_change_at = new Date().toISOString();
      user.token_version = nextTokenVersion;
      user.failed_login_attempts = 0;
      user.lockout_until = null;
      user.password_reset_token_hash = null;
      user.password_reset_expires_at = null;
      user.password_reset_requested_at = null;
      await user.save();

      const normalizedRoles = normalizeRoles(user.roles, user.role);
      const activeRole = resolveActiveRole(user.active_role || user.role, normalizedRoles);
      const token = signToken({
        id: user.id,
        email: user.email,
        activeRole,
        roles: normalizedRoles,
        locationId: user.location_id ? user.location_id.toString() : null,
        tokenVersion: nextTokenVersion,
      });
      setSessionCookies(res, token);

      res.json({ message: 'Password updated' });
    } catch (error) {
      next(error);
    }
  },
  setActiveRole: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });
      const requestedRole = readTrimmedString(req.body?.activeRole).toLowerCase();
      if (!requestedRole) {
        return res.status(400).json({ message: 'activeRole is required' });
      }

      const user = await UserModel.findById(userId);
      if (!user) return res.status(404).json({ message: 'Not found' });

      const availableRoles = normalizeRoles(req.user?.roles, user.role);
      const activeRole = resolveActiveRole(requestedRole, availableRoles);
      const isDelegatedRole = !normalizeRoles(user.roles, user.role, { allowEmpty: true }).includes(activeRole);
      if (!isDelegatedRole) {
        user.active_role = activeRole;
        user.role = activeRole;
        user.roles = normalizeRoles(user.roles, user.role);
        await user.save();
      }

      const token = signToken({
        id: user.id,
        email: user.email,
        activeRole,
        roles: availableRoles,
        locationId: user.location_id ? user.location_id.toString() : null,
        tokenVersion: Number(user.token_version || 0),
      });
      setSessionCookies(res, token);

      return res.json({
        role: resolveRuntimeRole(activeRole),
        activeRole,
        roles: availableRoles,
      });
    } catch (error) {
      next(error);
    }
  },
  logout: async (_req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      clearSessionCookies(res);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
