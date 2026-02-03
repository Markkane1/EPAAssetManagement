import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { UserModel } from '../models/user.model';
import { OfficeModel } from '../models/office.model';

export interface AuthPayload {
  userId: string;
  email: string;
  role: string;
  locationId?: string | null;
  isHeadoffice?: boolean;
}

export interface AuthRequest extends Request {
  user?: AuthPayload;
}

type RequestWithCache = AuthRequest & { __userLoaded?: boolean };

async function attachUserContext(req: AuthRequest) {
  const cached = (req as RequestWithCache).__userLoaded;
  if (cached) return;

  if (!req.user) return;

  const userDoc = await UserModel.findById(req.user.userId);
  if (!userDoc) {
    req.user = undefined;
    return;
  }

  const locationId = userDoc.location_id ? userDoc.location_id.toString() : null;
  let isHeadoffice = req.user.role === 'super_admin';

  if (!isHeadoffice && locationId) {
    const office = await OfficeModel.findById(locationId);
    if (office?.is_headoffice && (req.user.role === 'admin' || req.user.role === 'headoffice_admin')) {
      isHeadoffice = true;
    }
  }

  req.user = {
    ...req.user,
    locationId,
    isHeadoffice,
  };

  (req as RequestWithCache).__userLoaded = true;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const token = header.replace('Bearer ', '');
  try {
    const payload = jwt.verify(token, env.jwtSecret) as AuthPayload;
    req.user = {
      ...payload,
      role: payload.role === 'manager' ? 'admin' : payload.role,
    };
    await attachUserContext(req);
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    return next();
  } catch {
    return res.status(401).json({ message: 'Unauthorized' });
  }
}

export async function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next();
  }

  const token = header.replace('Bearer ', '');
  try {
    const payload = jwt.verify(token, env.jwtSecret) as AuthPayload;
    req.user = {
      ...payload,
      role: payload.role === 'manager' ? 'admin' : payload.role,
    };
    await attachUserContext(req);
    if (!req.user) {
      return next();
    }
  } catch {
    req.user = undefined;
  }
  return next();
}
