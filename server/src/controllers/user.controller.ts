import { Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { UserModel } from '../models/user.model';
import { OfficeModel } from '../models/office.model';
import type { AuthRequest } from '../middleware/auth';
import { normalizeRole } from '../utils/roles';
import { validateStrongPassword } from '../utils/passwordPolicy';
import { escapeRegex, readPagination } from '../utils/requestParsing';

const isAdminRole = (role?: string | null) => role === 'org_admin';

export const userController = {
  list: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!isAdminRole(req.user?.role)) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      const { limit, skip } = readPagination(req.query as Record<string, unknown>, { defaultLimit: 200, maxLimit: 500 });
      const search = String(req.query.search || '').trim();

      const query: Record<string, unknown> = {};
      if (search.length > 0) {
        const regex = new RegExp(escapeRegex(search), 'i');
        query.$or = [
          { email: regex },
          { first_name: regex },
          { last_name: regex },
        ];
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

      const mapped = users.map((user) => ({
        id: String((user as { _id: unknown })._id),
        user_id: String((user as { _id: unknown })._id),
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        location_id: user.location_id,
        created_at: user.created_at,
        role: normalizeRole(user.role),
        location_name: user.location_id ? locationMap.get(user.location_id.toString()) || null : null,
      }));

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
      if (!isAdminRole(req.user?.role)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      const { email, password, firstName, lastName, role, locationId } = req.body as {
        email: string;
        password: string;
        firstName?: string;
        lastName?: string;
        role?: string;
        locationId?: string;
      };

      const normalizedRole = normalizeRole(role || 'employee');
      const existing = await UserModel.findOne({ email: email.toLowerCase() });
      if (existing) return res.status(409).json({ message: 'Email already in use' });

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await UserModel.create({
        email,
        password_hash: passwordHash,
        first_name: firstName || null,
        last_name: lastName || null,
        role: normalizedRole,
        location_id: locationId || null,
      });

      res.status(201).json({
        id: user.id,
        user_id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        location_id: user.location_id,
        created_at: user.created_at,
        role: normalizeRole(user.role),
      });
    } catch (error) {
      next(error);
    }
  },
  updateRole: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { role } = req.body as { role: string };
      if (!isAdminRole(req.user?.role)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      const existing = await UserModel.findById(req.params.id);
      if (!existing) return res.status(404).json({ message: 'Not found' });
      const normalizedRole = normalizeRole(role);

      const user = await UserModel.findByIdAndUpdate(req.params.id, { role: normalizedRole }, { new: true });
      if (!user) return res.status(404).json({ message: 'Not found' });
      res.json({ role: normalizeRole(user.role) });
    } catch (error) {
      next(error);
    }
  },
  updateLocation: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!isAdminRole(req.user?.role)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      const existing = await UserModel.findById(req.params.id);
      if (!existing) return res.status(404).json({ message: 'Not found' });
      const { locationId } = req.body as { locationId: string | null };
      const user = await UserModel.findByIdAndUpdate(req.params.id, { location_id: locationId }, { new: true });
      if (!user) return res.status(404).json({ message: 'Not found' });
      res.json({ location_id: user.location_id });
    } catch (error) {
      next(error);
    }
  },
  resetPassword: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!isAdminRole(req.user?.role)) {
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
      if (!isAdminRole(req.user?.role)) {
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
