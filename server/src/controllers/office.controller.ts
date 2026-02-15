import { Request, Response, NextFunction } from 'express';
import { OfficeModel } from '../models/office.model';
import { mapFields } from '../utils/mapFields';
import type { AuthRequest } from '../middleware/auth';

const fieldMap = {
  name: 'name',
  division: 'division',
  district: 'district',
  address: 'address',
  contactNumber: 'contact_number',
  type: 'type',
  parentOfficeId: 'parent_office_id',
  // Deprecated input alias kept for backward compatibility
  parentLocationId: 'parent_location_id',
  labCode: 'lab_code',
  isActive: 'is_active',
  isHeadoffice: 'is_headoffice',
};

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeOfficeForResponse<T extends Record<string, unknown>>(office: T) {
  const normalized = { ...office };
  if (normalized.parent_office_id === undefined || normalized.parent_office_id === null) {
    normalized.parent_office_id = (normalized.parent_location_id as unknown) ?? null;
  }
  return normalized;
}

const buildPayload = (body: Record<string, unknown>) => {
  const payload = mapFields(body, fieldMap);
  Object.values(fieldMap).forEach((dbKey) => {
    if (body[dbKey] !== undefined) {
      payload[dbKey] = body[dbKey];
    }
  });

  // Read deprecated parent field as fallback, but only write canonical parent_office_id.
  if (payload.parent_office_id === undefined && payload.parent_location_id !== undefined) {
    payload.parent_office_id = payload.parent_location_id;
  }
  if (payload.parent_office_id === '') {
    payload.parent_office_id = null;
  }
  delete payload.parent_location_id;

  if (body.capabilities !== undefined) {
    payload.capabilities = body.capabilities;
  }
  return payload;
};

export const officeController = {
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = clampInt((req.query as Record<string, unknown>).limit, 500, 1, 2000);
      const page = clampInt((req.query as Record<string, unknown>).page, 1, 1, 100000);
      const skip = (page - 1) * limit;
      const data = await OfficeModel.find()
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      res.json(data.map((office) => normalizeOfficeForResponse(office as Record<string, unknown>)));
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await OfficeModel.findById(req.params.id).lean();
      if (!data) return res.status(404).json({ message: 'Not found' });
      return res.json(normalizeOfficeForResponse(data as Record<string, unknown>));
    } catch (error) {
      next(error);
    }
  },
  create: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const payload = buildPayload(req.body);
      if (payload.is_headoffice && req.user?.role !== 'org_admin') {
        return res.status(403).json({ message: 'Only org admin can modify legacy head-office flag' });
      }
      const type = String(payload.type || '');
      const payloadCapabilities = asRecord(payload.capabilities);
      if (type === 'DISTRICT_LAB') {
        payload.capabilities = { ...(payloadCapabilities || {}), chemicals: true };
      } else if (payloadCapabilities) {
        payload.capabilities = { ...payloadCapabilities, chemicals: false };
      }
      const data = await OfficeModel.create(payload);
      const json = data.toJSON() as Record<string, unknown>;
      return res.status(201).json(normalizeOfficeForResponse(json));
    } catch (error) {
      next(error);
    }
  },
  update: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const payload = buildPayload(req.body);
      if (payload.is_headoffice !== undefined && req.user?.role !== 'org_admin') {
        return res.status(403).json({ message: 'Only org admin can modify legacy head-office flag' });
      }
      const existing = await OfficeModel.findById(req.params.id);
      if (!existing) return res.status(404).json({ message: 'Not found' });

      const payloadCapabilities = asRecord(payload.capabilities);
      const existingCapabilities = asRecord(existing.capabilities);
      const effectiveType = String(payload.type ?? existing.type ?? '');
      if (effectiveType === 'DISTRICT_LAB') {
        payload.capabilities = {
          ...(existingCapabilities || {}),
          ...(payloadCapabilities || {}),
          chemicals: true,
        };
      } else if (payload.type !== undefined || payload.capabilities !== undefined) {
        payload.capabilities = {
          ...(existingCapabilities || {}),
          ...(payloadCapabilities || {}),
          chemicals: false,
        };
      }

      const data = await OfficeModel.findByIdAndUpdate(req.params.id, payload, { new: true });
      if (!data) return res.status(404).json({ message: 'Not found' });
      const json = data.toJSON() as Record<string, unknown>;
      return res.json(normalizeOfficeForResponse(json));
    } catch (error) {
      next(error);
    }
  },
  remove: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await OfficeModel.findByIdAndDelete(req.params.id);
      if (!data) return res.status(404).json({ message: 'Not found' });
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
