import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { UserModel } from '../models/user.model';
import { isKnownRole, normalizeRole } from '../utils/roles';

export interface AuthPayload {
  userId: string;
  email: string;
  role: string;
  locationId: string | null;
  isOrgAdmin: boolean;
}

export interface AuthRequest extends Request {
  user?: AuthPayload;
}

type RequestWithCache = AuthRequest & { __userLoaded?: boolean };
type RequestWithCookies = Request & { cookies?: Record<string, string> };

function readToken(req: Request) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    return header.replace('Bearer ', '').trim();
  }
  return (req as RequestWithCookies).cookies?.auth_token || null;
}

async function attachUserContext(req: AuthRequest) {
  const cached = (req as RequestWithCache).__userLoaded;
  if (cached) return;

  if (!req.user) return;

  const userDoc = await UserModel.findById(req.user.userId);
  if (!userDoc) {
    req.user = undefined;
    return;
  }
  if (!isKnownRole(userDoc.role)) {
    req.user = undefined;
    return;
  }
  if (userDoc.is_active === false) {
    req.user = undefined;
    return;
  }

  const normalizedRole = normalizeRole(userDoc.role);
  const locationId = userDoc.location_id ? userDoc.location_id.toString() : null;
  const isOrgAdmin = normalizedRole === 'org_admin';

  req.user = {
    ...req.user,
    role: normalizedRole,
    locationId,
    isOrgAdmin,
  };

  (req as RequestWithCache).__userLoaded = true;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = readToken(req);
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret) as AuthPayload;
    if (!isKnownRole(payload.role)) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    req.user = {
      ...payload,
      role: normalizeRole(payload.role),
      locationId: payload.locationId ?? null,
      isOrgAdmin: payload.isOrgAdmin ?? normalizeRole(payload.role) === 'org_admin',
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
  const token = readToken(req);
  if (!token) {
    return next();
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret) as AuthPayload;
    if (!isKnownRole(payload.role)) {
      req.user = undefined;
      return next();
    }
    req.user = {
      ...payload,
      role: normalizeRole(payload.role),
      locationId: payload.locationId ?? null,
      isOrgAdmin: payload.isOrgAdmin ?? normalizeRole(payload.role) === 'org_admin',
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

