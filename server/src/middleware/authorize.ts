import type { NextFunction, Response } from 'express';
import type { AuthRequest } from './auth';
import { OfficeModel } from '../models/office.model';
import { hasRoleCapability } from '../utils/roles';

export const ADMIN_ROLES = new Set(['org_admin']);

export function requireRoles(roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const effectiveRoles =
      Array.isArray(user.roles) && user.roles.length > 0
        ? user.roles
        : [String(user.activeRole || user.role || '').trim().toLowerCase()];
    if (hasRoleCapability(effectiveRoles, roles)) {
      return next();
    }
    return res.status(403).json({ message: 'Forbidden' });
  };
}

export const requireAdmin = requireRoles(['org_admin']);

export async function requireOrgAdminOrCentralStoreCaretaker(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const role = String(req.user?.role || '').trim().toLowerCase();
    if (!role) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (role === 'org_admin') {
      return next();
    }

    if (role !== 'caretaker') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const locationId = String(req.user?.locationId || '').trim();
    if (!locationId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const office: any = await OfficeModel.findById(locationId, { _id: 1, type: 1, is_active: 1 }).lean();
    const officeType = String(office?.type || '').trim().toUpperCase();
    if (!office?._id || office?.is_active === false || officeType !== 'HEAD_OFFICE') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    return next();
  } catch (error) {
    return next(error);
  }
}
