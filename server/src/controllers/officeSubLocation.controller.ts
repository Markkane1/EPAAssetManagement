import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import type { AuthRequest } from '../middleware/auth';
import { createHttpError } from '../utils/httpError';
import { OfficeSubLocationModel } from '../models/officeSubLocation.model';
import { OfficeModel } from '../models/office.model';

const WRITE_ROLES = new Set(['org_admin', 'office_head', 'caretaker']);

function parseBoolean(value: unknown, fallback: boolean) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  throw createHttpError(400, 'includeInactive must be a boolean');
}

function parseOfficeId(value: unknown) {
  const parsed = String(value ?? '').trim();
  if (!parsed) return null;
  if (!Types.ObjectId.isValid(parsed)) {
    throw createHttpError(400, 'officeId is invalid');
  }
  return parsed;
}

function parseBodyOfficeId(value: unknown) {
  const parsed = String(value ?? '').trim();
  if (!parsed) return null;
  if (!Types.ObjectId.isValid(parsed)) {
    throw createHttpError(400, 'office_id is invalid');
  }
  return parsed;
}

function parseName(value: unknown) {
  const parsed = String(value ?? '').trim();
  if (!parsed) throw createHttpError(400, 'name is required');
  return parsed;
}

function readParamId(req: AuthRequest, key: string) {
  const raw = req.params?.[key];
  if (Array.isArray(raw)) return String(raw[0] || '').trim();
  return String(raw || '').trim();
}

function ensureWritePermission(req: AuthRequest) {
  const role = req.user?.role;
  if (!role) throw createHttpError(401, 'Unauthorized');
  if (!WRITE_ROLES.has(role)) {
    throw createHttpError(403, 'Forbidden');
  }
}

export const officeSubLocationController = {
  list: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user) throw createHttpError(401, 'Unauthorized');

      const requestedOfficeId = parseOfficeId(req.query.officeId);
      const includeInactive = parseBoolean(req.query.includeInactive, false);

      let effectiveOfficeId: string | null = requestedOfficeId;
      if (!effectiveOfficeId) {
        effectiveOfficeId = user.locationId || null;
        if (!effectiveOfficeId && !user.isOrgAdmin) {
          throw createHttpError(400, 'officeId is required for users without an assigned office');
        }
      }

      if (!user.isOrgAdmin) {
        if (!user.locationId) {
          throw createHttpError(400, 'User is not assigned to an office');
        }
        if (effectiveOfficeId !== user.locationId) {
          throw createHttpError(403, 'Access restricted to assigned office');
        }
      }

      const filter: Record<string, unknown> = {};
      if (effectiveOfficeId) filter.office_id = effectiveOfficeId;
      if (!includeInactive) filter.is_active = true;

      const rows = await OfficeSubLocationModel.find(filter).sort({ name: 1, created_at: -1 }).lean();
      return res.json(rows);
    } catch (error) {
      return next(error);
    }
  },

  create: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      ensureWritePermission(req);
      const user = req.user!;

      const name = parseName(req.body?.name);
      const bodyOfficeId = parseBodyOfficeId(req.body?.office_id);

      if (bodyOfficeId && !user.isOrgAdmin) {
        throw createHttpError(403, 'Only org_admin can provide office_id');
      }

      let officeId = bodyOfficeId;
      if (!officeId) {
        officeId = user.locationId || null;
      }
      if (!officeId) {
        throw createHttpError(400, 'office_id is required');
      }

      if (!user.isOrgAdmin) {
        if (!user.locationId) {
          throw createHttpError(400, 'User is not assigned to an office');
        }
        officeId = user.locationId;
      }

      const officeExists = await OfficeModel.exists({ _id: officeId });
      if (!officeExists) {
        throw createHttpError(404, 'Office not found');
      }

      const row = await OfficeSubLocationModel.create({
        office_id: officeId,
        name,
      });
      return res.status(201).json(row);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && (error as { code?: number }).code === 11000) {
        return next(createHttpError(409, 'A room with this name already exists in the office'));
      }
      return next(error);
    }
  },

  update: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      ensureWritePermission(req);
      const user = req.user!;
      const subLocationId = readParamId(req, 'id');
      if (!Types.ObjectId.isValid(subLocationId)) {
        throw createHttpError(400, 'id is invalid');
      }

      const existing = await OfficeSubLocationModel.findById(subLocationId);
      if (!existing) {
        throw createHttpError(404, 'Not found');
      }

      const officeId = existing.office_id ? String(existing.office_id) : null;
      if (!officeId) {
        throw createHttpError(400, 'Office is missing on sub-location');
      }
      if (!user.isOrgAdmin) {
        if (!user.locationId) {
          throw createHttpError(400, 'User is not assigned to an office');
        }
        if (officeId !== user.locationId) {
          throw createHttpError(403, 'Access restricted to assigned office');
        }
      }

      if (req.body?.name !== undefined) {
        existing.name = parseName(req.body.name);
      }
      if (req.body?.is_active !== undefined) {
        if (typeof req.body.is_active === 'boolean') {
          existing.is_active = req.body.is_active;
        } else {
          const normalized = String(req.body.is_active).trim().toLowerCase();
          if (normalized === 'true' || normalized === '1') existing.is_active = true;
          else if (normalized === 'false' || normalized === '0') existing.is_active = false;
          else throw createHttpError(400, 'is_active must be a boolean');
        }
      }

      await existing.save();
      return res.json(existing);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && (error as { code?: number }).code === 11000) {
        return next(createHttpError(409, 'A room with this name already exists in the office'));
      }
      return next(error);
    }
  },
};

