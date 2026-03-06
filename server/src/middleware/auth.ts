import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { UserModel } from '../models/user.model';
import { RoleDelegationModel } from '../models/roleDelegation.model';
import {
  hasRoleCapability,
  normalizeRole,
  normalizeRoles,
  resolveActiveRole,
  resolveRuntimeRole,
} from '../utils/roles';

export interface AuthPayload {
  userId: string;
  email: string;
  role: string;
  activeRole: string;
  roles: string[];
  locationId: string | null;
  isOrgAdmin: boolean;
  tokenVersion: number;
}

export interface AuthRequest extends Request {
  user?: AuthPayload;
}

type RequestWithCache = AuthRequest & { __userLoaded?: boolean };
type RequestWithCookies = Request & { cookies?: Record<string, string> };
type JwtWithClaims = AuthPayload & jwt.JwtPayload;
const JWT_ALLOWED_ALGORITHMS: jwt.Algorithm[] = ['HS256'];

function readToken(req: Request) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    return header.replace('Bearer ', '').trim();
  }
  return (req as RequestWithCookies).cookies?.auth_token || null;
}

function isTokenInvalidatedByCutoff(payload: jwt.JwtPayload) {
  if (!env.jwtInvalidateBefore) return false;
  const issuedAt =
    typeof payload.iat === 'number'
      ? payload.iat
      : typeof payload.iat === 'string'
      ? Number.parseInt(payload.iat, 10)
      : NaN;
  if (!Number.isFinite(issuedAt)) return true;
  return issuedAt < env.jwtInvalidateBefore;
}

function hasRequiredClaims(payload: jwt.JwtPayload) {
  return typeof payload.exp === 'number' && Number.isFinite(payload.exp);
}

function verifyJwtToken(token: string) {
  return jwt.verify(token, env.jwtSecret, {
    algorithms: JWT_ALLOWED_ALGORITHMS,
  }) as JwtWithClaims;
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
  if (userDoc.is_active === false) {
    req.user = undefined;
    return;
  }

  const payloadTokenVersion = Number(req.user.tokenVersion);
  const dbTokenVersion = Number(userDoc.token_version || 0);
  if (!Number.isFinite(payloadTokenVersion) || payloadTokenVersion !== dbTokenVersion) {
    req.user = undefined;
    return;
  }

  const now = new Date();

  const storedRoles = normalizeRoles(userDoc.roles, userDoc.role);
  const activeDelegations = await RoleDelegationModel.find(
    {
      delegate_user_id: userDoc._id,
      status: 'ACTIVE',
      starts_at: { $lte: now },
      ends_at: { $gte: now },
    },
    { delegated_roles: 1, office_id: 1 }
  )
    .lean()
    .exec();
  const locationId = userDoc.location_id ? userDoc.location_id.toString() : null;
  const delegatedRoles = normalizeRoles(
    activeDelegations
      .filter((entry: any) => {
        const officeId = String(entry?.office_id || '').trim();
        if (!officeId) return false;
        if (!locationId) return false;
        return officeId === locationId;
      })
      .flatMap((entry: any) => (Array.isArray(entry?.delegated_roles) ? entry.delegated_roles : [])),
    null,
    { allowEmpty: true }
  );

  const mergedRoles = normalizeRoles([...storedRoles, ...delegatedRoles], req.user?.activeRole || userDoc.active_role);
  const activeRole = resolveActiveRole(req.user?.activeRole || userDoc.active_role, mergedRoles);
  let normalizedRole: string;
  try {
    normalizedRole = resolveRuntimeRole(activeRole);
  } catch {
    req.user = undefined;
    return;
  }
  const isOrgAdmin = hasRoleCapability(mergedRoles, ['org_admin']);

  req.user = {
    ...req.user,
    role: normalizedRole,
    activeRole,
    roles: mergedRoles,
    locationId,
    isOrgAdmin,
    tokenVersion: dbTokenVersion,
  };

  (req as RequestWithCache).__userLoaded = true;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = readToken(req);
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const payload = verifyJwtToken(token);
    if (!hasRequiredClaims(payload)) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (isTokenInvalidatedByCutoff(payload)) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    let normalizedTokenRole: string;
    try {
      normalizedTokenRole = normalizeRole(payload.activeRole || payload.role);
    } catch {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const normalizedRoles = normalizeRoles(payload.roles, normalizedTokenRole);
    const activeRole = resolveActiveRole(payload.activeRole || normalizedTokenRole, normalizedRoles);
    const normalizedRole = resolveRuntimeRole(activeRole);
    const tokenVersion = Number(payload.tokenVersion);
    if (!Number.isFinite(tokenVersion) || tokenVersion < 0) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    req.user = {
      ...payload,
      role: normalizedRole,
      activeRole,
      roles: normalizedRoles,
      locationId: payload.locationId ?? null,
      isOrgAdmin: payload.isOrgAdmin ?? hasRoleCapability(normalizedRoles, ['org_admin']),
      tokenVersion,
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
    const payload = verifyJwtToken(token);
    if (!hasRequiredClaims(payload)) {
      req.user = undefined;
      return next();
    }
    if (isTokenInvalidatedByCutoff(payload)) {
      req.user = undefined;
      return next();
    }
    let normalizedTokenRole: string;
    try {
      normalizedTokenRole = normalizeRole(payload.activeRole || payload.role);
    } catch {
      req.user = undefined;
      return next();
    }
    const normalizedRoles = normalizeRoles(payload.roles, normalizedTokenRole);
    const activeRole = resolveActiveRole(payload.activeRole || normalizedTokenRole, normalizedRoles);
    const normalizedRole = resolveRuntimeRole(activeRole);
    const tokenVersion = Number(payload.tokenVersion);
    if (!Number.isFinite(tokenVersion) || tokenVersion < 0) {
      req.user = undefined;
      return next();
    }
    req.user = {
      ...payload,
      role: normalizedRole,
      activeRole,
      roles: normalizedRoles,
      locationId: payload.locationId ?? null,
      isOrgAdmin: payload.isOrgAdmin ?? hasRoleCapability(normalizedRoles, ['org_admin']),
      tokenVersion,
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

