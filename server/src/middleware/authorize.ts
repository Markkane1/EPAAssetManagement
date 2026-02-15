import type { NextFunction, Response } from 'express';
import type { AuthRequest } from './auth';

export const ADMIN_ROLES = new Set(['org_admin']);

export function requireRoles(roles: string[]) {
  const roleSet = new Set(roles);
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (!role) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (roleSet.has(role)) {
      return next();
    }
    return res.status(403).json({ message: 'Forbidden' });
  };
}

export const requireAdmin = requireRoles(['org_admin']);
