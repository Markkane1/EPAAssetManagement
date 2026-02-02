import { Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { UserModel } from '../models/user.model';
import { OfficeModel } from '../models/office.model';
import type { AuthRequest } from '../middleware/auth';

const normalizeRole = (role?: string | null) => {
  if (role === 'manager') return 'admin';
  if (role === 'location_admin') return 'location_admin';
  return role || 'user';
};

const isAdminRole = (role?: string | null) => role === 'super_admin' || role === 'admin';

export const userController = {
  list: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!isAdminRole(req.user?.role)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      const users = await UserModel.find().sort({ created_at: -1 });
      const visibleUsers = req.user?.role === 'super_admin'
        ? users
        : users.filter((user) => normalizeRole(user.role) !== 'super_admin');
      const locationIds = visibleUsers.map((u) => u.location_id).filter(Boolean);
      const locations = await OfficeModel.find({
        _id: { $in: locationIds },
      });
      const locationMap = new Map(locations.map((l) => [l.id, l.name]));

      const mapped = visibleUsers.map((user) => ({
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
