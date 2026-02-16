import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { UserModel } from '../models/user.model';
import { EmployeeModel } from '../models/employee.model';
import { ActivityLogModel } from '../models/activityLog.model';
import { env } from '../config/env';
import type { AuthRequest } from '../middleware/auth';
import { ADMIN_ROLES } from '../middleware/authorize';
import { normalizeRole } from '../utils/roles';
import { validateStrongPassword } from '../utils/passwordPolicy';

type RequestWithCookies = Request & { cookies?: Record<string, string> };

function signToken(user: {
  id: string;
  email: string;
  role: string;
  locationId?: string | null;
  tokenVersion: number;
}) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      locationId: user.locationId || null,
      isOrgAdmin: user.role === 'org_admin',
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

export const authController = {
  register: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user || !ADMIN_ROLES.has(req.user.role)) {
        return res.status(403).json({ message: 'Self-registration is disabled' });
      }
      const { email, password, firstName, lastName, role, locationId } = req.body as {
        email: string;
        password: string;
        firstName?: string;
        lastName?: string;
        role?: string;
        locationId?: string;
      };

      const normalizedEmail = String(email || '').trim().toLowerCase();
      if (!normalizedEmail || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
      }
      if (String(password).length < 8) {
        return res.status(400).json({ message: 'Password must be at least 8 characters' });
      }

      const existing = await UserModel.findOne({ email: normalizedEmail });
      if (existing) return res.status(409).json({ message: 'Email already in use' });

      const passwordHash = await bcrypt.hash(password, 10);
      const requestedRoleRaw = String(role || '')
        .trim()
        .toLowerCase();
      const allowedRoles = ['org_admin', 'office_head', 'caretaker', 'employee'];
      if (requestedRoleRaw && !allowedRoles.includes(requestedRoleRaw)) {
        return res.status(400).json({ message: 'Invalid role' });
      }
      const normalizedRole = normalizeRole(role || 'employee');
      if (normalizedRole === 'org_admin' && req.user.role !== 'org_admin') {
        return res.status(403).json({ message: 'Forbidden' });
      }
      const user = await UserModel.create({
        email: normalizedEmail,
        password_hash: passwordHash,
        first_name: firstName || null,
        last_name: lastName || null,
        role: normalizedRole,
        location_id: locationId || null,
      });

      res.status(201).json({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: normalizedRole,
        },
      });
    } catch (error) {
      next(error);
    }
  },
  login: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body as { email: string; password: string };
      const normalizedEmail = String(email || '').trim().toLowerCase();
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

      const normalizedRole = normalizeRole(user.role);
      if (user.role !== normalizedRole) {
        user.role = normalizedRole;
      }
      user.last_login_at = new Date().toISOString();
      user.failed_login_attempts = 0;
      user.lockout_until = null;
      await user.save();

      const token = signToken({
        id: user.id,
        email: user.email,
        role: normalizedRole,
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
          role: normalizedRole,
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
      res.json({
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: normalizeRole(user.role),
        locationId: user.location_id,
      });
    } catch (error) {
      next(error);
    }
  },
  requestPasswordReset: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.body as { email: string };
      const normalizedEmail = (email || '').trim().toLowerCase();

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

      const adminUsers = await UserModel.find({ role: 'org_admin' });
      const locationAdminUsers = await UserModel.find({ role: 'office_head' });
      const globalAdmins = adminUsers.filter((admin) => !admin.location_id);
      const locationAdmins = requesterLocationId
        ? [
            ...adminUsers.filter((admin) => admin.location_id?.toString() === requesterLocationId.toString()),
            ...locationAdminUsers.filter((admin) => admin.location_id?.toString() === requesterLocationId.toString()),
          ]
        : [];

      const directorateHeads = requesterDirectorateId
        ? await UserModel.find({ role: 'office_head' })
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
      const normalizedToken = String(token || '').trim();
      const normalizedPassword = String(newPassword || '');

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

      if (!oldPassword || !newPassword) {
        return res.status(400).json({ message: 'Missing password fields' });
      }

      const passwordValidationError = validateStrongPassword(newPassword);
      if (passwordValidationError) {
        return res.status(400).json({ message: passwordValidationError });
      }
      if (oldPassword === newPassword) {
        return res.status(400).json({ message: 'New password must be different from current password' });
      }

      const user = await UserModel.findById(userId);
      if (!user) return res.status(404).json({ message: 'Not found' });

      const valid = await bcrypt.compare(oldPassword, user.password_hash);
      if (!valid) return res.status(400).json({ message: 'Current password is incorrect' });

      const passwordHash = await bcrypt.hash(newPassword, 10);
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

      const normalizedRole = normalizeRole(user.role);
      const token = signToken({
        id: user.id,
        email: user.email,
        role: normalizedRole,
        locationId: user.location_id ? user.location_id.toString() : null,
        tokenVersion: nextTokenVersion,
      });
      setSessionCookies(res, token);

      res.json({ message: 'Password updated' });
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
