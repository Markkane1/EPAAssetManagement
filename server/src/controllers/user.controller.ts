import { Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { UserModel } from '../models/user.model';
import { EmployeeModel } from '../models/employee.model';
import { OfficeModel } from '../models/office.model';
import type { AuthRequest } from '../middleware/auth';
import {
  hasRoleCapability,
  normalizeRoles,
  resolveActiveRole,
} from '../utils/roles';
import { validateStrongPassword } from '../utils/passwordPolicy';
import { escapeRegex, readPagination } from '../utils/requestParsing';
import { buildSearchTermsQuery } from '../utils/searchTerms';

const isAdminUser = (user?: AuthRequest['user']) => Boolean(user?.isOrgAdmin || hasRoleCapability(user?.roles || [], ['org_admin']));

async function ensureEmployeeProfileForUser(input: {
  userId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  locationId?: string | null;
}) {
  const normalizedEmail = String(input.email || '').trim().toLowerCase();
  if (!normalizedEmail) return;

  const byUserId = await EmployeeModel.findOne({ user_id: input.userId });
  if (byUserId) {
    let changed = false;
    if (!byUserId.email || String(byUserId.email).toLowerCase() !== normalizedEmail) {
      byUserId.email = normalizedEmail;
      changed = true;
    }
    if (!byUserId.first_name && input.firstName) {
      byUserId.first_name = input.firstName;
      changed = true;
    }
    if (!byUserId.last_name && input.lastName) {
      byUserId.last_name = input.lastName;
      changed = true;
    }
    if (input.locationId !== undefined) {
      const nextLocationId = input.locationId || null;
      const currentLocationId = byUserId.location_id ? String(byUserId.location_id) : null;
      if (currentLocationId !== nextLocationId) {
        byUserId.location_id = nextLocationId;
        changed = true;
      }
    }
    if (byUserId.is_active === false) {
      byUserId.is_active = true;
      changed = true;
    }
    if (changed) await byUserId.save();
    return;
  }

  const byEmail = await EmployeeModel.findOne({
    email: { $regex: `^${escapeRegex(normalizedEmail)}$`, $options: 'i' },
  });
  if (byEmail) {
    let changed = false;
    if (!byEmail.user_id) {
      byEmail.user_id = input.userId as any;
      changed = true;
    }
    if (!byEmail.first_name && input.firstName) {
      byEmail.first_name = input.firstName;
      changed = true;
    }
    if (!byEmail.last_name && input.lastName) {
      byEmail.last_name = input.lastName;
      changed = true;
    }
    if (input.locationId !== undefined) {
      const nextLocationId = input.locationId || null;
      const currentLocationId = byEmail.location_id ? String(byEmail.location_id) : null;
      if (currentLocationId !== nextLocationId) {
        byEmail.location_id = nextLocationId;
        changed = true;
      }
    }
    if (byEmail.is_active === false) {
      byEmail.is_active = true;
      changed = true;
    }
    if (changed) await byEmail.save();
    return;
  }

  await EmployeeModel.create({
    user_id: input.userId,
    email: normalizedEmail,
    first_name: String(input.firstName || '').trim() || 'Employee',
    last_name: String(input.lastName || '').trim() || 'User',
    location_id: input.locationId || null,
    is_active: true,
  });
}

export const userController = {
  list: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!isAdminUser(req.user)) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      const { limit, skip } = readPagination(req.query as Record<string, unknown>, { defaultLimit: 200, maxLimit: 500 });
      const search = String(req.query.search || '').trim();

      const query: Record<string, unknown> = {};
      if (search.length > 0) {
        Object.assign(query, buildSearchTermsQuery(search) || {});
      }

      const users = await UserModel.find(
        query,
        {
          email: 1,
          first_name: 1,
          last_name: 1,
          location_id: 1,
          created_at: 1,
          role: 1,
          roles: 1,
          active_role: 1,
        }
      )
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      const includeMeta = String(req.query.meta || '').trim().toLowerCase();
      const wantsMeta = includeMeta === '1' || includeMeta === 'true';

      const locationIds = users.map((u) => u.location_id).filter(Boolean);
      const locations = await OfficeModel.find({
        _id: { $in: locationIds },
      }, { name: 1 }).lean();
      const locationMap = new Map(
        locations.map((location) => [String((location as { _id: unknown })._id), location.name])
      );

      const mapped = users.map((user) => {
        const normalizedRoles = normalizeRoles(user.roles, user.role);
        const activeRole = resolveActiveRole(user.active_role || user.role, normalizedRoles);
        return {
          id: String((user as { _id: unknown })._id),
          user_id: String((user as { _id: unknown })._id),
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          location_id: user.location_id,
          created_at: user.created_at,
          role: activeRole,
          activeRole,
          roles: normalizedRoles,
          location_name: user.location_id ? locationMap.get(user.location_id.toString()) || null : null,
        };
      });

      if (!wantsMeta) {
        res.json(mapped);
        return;
      }

      const total = await UserModel.countDocuments(query);
      res.json({
        items: mapped,
        page: Math.floor(skip / limit) + 1,
        limit,
        total,
        hasMore: skip + mapped.length < total,
      });
    } catch (error) {
      next(error);
    }
  },
  create: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!isAdminUser(req.user)) {
        return res.status(403).json({ message: 'Forbidden' });
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

      const normalizedRoles = normalizeRoles(roles, role || 'employee');
      const normalizedActiveRole = resolveActiveRole(activeRole || role || normalizedRoles[0], normalizedRoles);
      const existing = await UserModel.findOne({ email: email.toLowerCase() });
      if (existing) return res.status(409).json({ message: 'Email already in use' });

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await UserModel.create({
        email,
        password_hash: passwordHash,
        first_name: firstName || null,
        last_name: lastName || null,
        role: normalizedActiveRole,
        roles: normalizedRoles,
        active_role: normalizedActiveRole,
        location_id: locationId || null,
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
        id: user.id,
        user_id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        location_id: user.location_id,
        created_at: user.created_at,
        role: normalizedActiveRole,
        activeRole: normalizedActiveRole,
        roles: normalizedRoles,
      });
    } catch (error) {
      next(error);
    }
  },
  updateRole: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { role, roles, activeRole } = req.body as {
        role?: string;
        roles?: string[];
        activeRole?: string;
      };
      if (!isAdminUser(req.user)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      const existing = await UserModel.findById(req.params.id);
      if (!existing) return res.status(404).json({ message: 'Not found' });
      const normalizedRoles = normalizeRoles(roles, role || existing.role);
      const normalizedActiveRole = resolveActiveRole(
        activeRole || role || existing.active_role || existing.role,
        normalizedRoles
      );

      const user = await UserModel.findByIdAndUpdate(
        req.params.id,
        { role: normalizedActiveRole, roles: normalizedRoles, active_role: normalizedActiveRole },
        { new: true }
      );
      if (!user) return res.status(404).json({ message: 'Not found' });
      if (hasRoleCapability(normalizedRoles, ['employee'])) {
        await ensureEmployeeProfileForUser({
          userId: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          locationId: user.location_id ? String(user.location_id) : null,
        });
      }
      res.json({
        role: normalizedActiveRole,
        activeRole: normalizedActiveRole,
        roles: normalizedRoles,
      });
    } catch (error) {
      next(error);
    }
  },
  updateLocation: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!isAdminUser(req.user)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      const existing = await UserModel.findById(req.params.id);
      if (!existing) return res.status(404).json({ message: 'Not found' });
      const { locationId } = req.body as { locationId: string | null };
      const user = await UserModel.findByIdAndUpdate(req.params.id, { location_id: locationId }, { new: true });
      if (!user) return res.status(404).json({ message: 'Not found' });
      const normalizedRoles = normalizeRoles(user.roles, user.role);
      if (hasRoleCapability(normalizedRoles, ['employee'])) {
        await ensureEmployeeProfileForUser({
          userId: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          locationId: user.location_id ? String(user.location_id) : null,
        });
      }
      res.json({ location_id: user.location_id });
    } catch (error) {
      next(error);
    }
  },
  resetPassword: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!isAdminUser(req.user)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      const existing = await UserModel.findById(req.params.id);
      if (!existing) return res.status(404).json({ message: 'Not found' });
      const { newPassword } = req.body as { newPassword: string };
      const passwordValidationError = validateStrongPassword(newPassword);
      if (passwordValidationError) {
        return res.status(400).json({ message: passwordValidationError });
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      const nextTokenVersion = Number(existing.token_version || 0) + 1;
      const user = await UserModel.findByIdAndUpdate(
        req.params.id,
        {
          password_hash: passwordHash,
          last_password_change_at: new Date().toISOString(),
          token_version: nextTokenVersion,
          failed_login_attempts: 0,
          lockout_until: null,
          password_reset_token_hash: null,
          password_reset_expires_at: null,
          password_reset_requested_at: null,
        },
        { new: true }
      );
      if (!user) return res.status(404).json({ message: 'Not found' });
      res.json({ message: 'Password updated' });
    } catch (error) {
      next(error);
    }
  },
  remove: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!isAdminUser(req.user)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      const existing = await UserModel.findById(req.params.id);
      if (!existing) return res.status(404).json({ message: 'Not found' });
      const user = await UserModel.findByIdAndDelete(req.params.id);
      if (!user) return res.status(404).json({ message: 'Not found' });
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
