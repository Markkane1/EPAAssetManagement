import { Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { UserModel } from '../models/user.model';
import { OfficeModel } from '../models/office.model';
import type { AuthRequest } from '../middleware/auth';
import { normalizeRole } from '../utils/roles';

const isAdminRole = (role?: string | null) => role === 'super_admin' || role === 'admin';

function clampInt(value: unknown, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.floor(parsed), max));
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const userController = {
  list: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!isAdminRole(req.user?.role)) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      const limit = clampInt(req.query.limit, 200, 500);
      const page = clampInt(req.query.page, 1, 10_000);
      const skip = (page - 1) * limit;
      const search = String(req.query.search || '').trim();

      const query: Record<string, unknown> = {};
      if (req.user?.role !== 'super_admin') {
        query.role = { $ne: 'super_admin' };
      }
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
        .limit(limit);

      const locationIds = users.map((u) => u.location_id).filter(Boolean);
      const locations = await OfficeModel.find({
        _id: { $in: locationIds },
      }, { name: 1 });
      const locationMap = new Map(locations.map((l) => [l.id, l.name]));

      const mapped = users.map((user) => ({
        id: user.id,
        user_id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        location_id: user.location_id,
        created_at: user.created_at,
        role: normalizeRole(user.role),
        location_name: user.location_id ? locationMap.get(user.location_id.toString()) || null : null,
      }));

      res.json(mapped);
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

      const normalizedRole = normalizeRole(role);
      if (normalizedRole === 'super_admin' && req.user?.role !== 'super_admin') {
        return res.status(403).json({ message: 'Forbidden' });
      }

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
      if (normalizeRole(existing.role) === 'super_admin' && req.user?.role !== 'super_admin') {
        return res.status(403).json({ message: 'Forbidden' });
      }
      const normalizedRole = normalizeRole(role);
      if (normalizedRole === 'super_admin' && req.user?.role !== 'super_admin') {
        return res.status(403).json({ message: 'Forbidden' });
      }

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
      if (normalizeRole(existing.role) === 'super_admin' && req.user?.role !== 'super_admin') {
        return res.status(403).json({ message: 'Forbidden' });
      }
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
      if (normalizeRole(existing.role) === 'super_admin' && req.user?.role !== 'super_admin') {
        return res.status(403).json({ message: 'Forbidden' });
      }
      const { newPassword } = req.body as { newPassword: string };
      const passwordHash = await bcrypt.hash(newPassword, 10);
      const user = await UserModel.findByIdAndUpdate(req.params.id, { password_hash: passwordHash }, { new: true });
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
      if (normalizeRole(existing.role) === 'super_admin' && req.user?.role !== 'super_admin') {
        return res.status(403).json({ message: 'Forbidden' });
      }
      const user = await UserModel.findByIdAndDelete(req.params.id);
      if (!user) return res.status(404).json({ message: 'Not found' });
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
