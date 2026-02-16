import { Request, Response, NextFunction } from 'express';
import { OfficeModel } from '../models/office.model';
import { mapFields } from '../utils/mapFields';
import type { AuthRequest } from '../middleware/auth';
import { escapeRegex, readPagination } from '../utils/requestParsing';

const fieldMap = {
  name: 'name',
  division: 'division',
  district: 'district',
  address: 'address',
  contactNumber: 'contact_number',
  type: 'type',
  parentOfficeId: 'parent_office_id',
  isActive: 'is_active',
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readParamId(req: Request, key: string) {
  const raw = req.params?.[key];
  if (Array.isArray(raw)) return String(raw[0] || '').trim();
  return String(raw || '').trim();
}

const buildPayload = (body: Record<string, unknown>) => {
  const payload = mapFields(body, fieldMap);
  Object.values(fieldMap).forEach((dbKey) => {
    if (body[dbKey] !== undefined) {
      payload[dbKey] = body[dbKey];
    }
  });
  if (payload.parent_office_id === '') {
    payload.parent_office_id = null;
  }

  if (body.capabilities !== undefined) {
    payload.capabilities = body.capabilities;
  }
  return payload;
};

export const officeController = {
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as Record<string, unknown>;
      const { limit, skip } = readPagination(query, { defaultLimit: 200, maxLimit: 2000 });
      const filter: Record<string, unknown> = {};
      const search = String(query.search || '').trim();
      if (search) {
        const regex = new RegExp(escapeRegex(search), 'i');
        filter.$or = [{ name: regex }, { code: regex }, { division: regex }, { district: regex }];
      }
      if (query.type) {
        filter.type = String(query.type).trim();
      }
      if (query.isActive !== undefined) {
        const normalized = String(query.isActive).trim().toLowerCase();
        if (normalized === 'true') filter.is_active = true;
        if (normalized === 'false') filter.is_active = false;
      }

      const data = await OfficeModel.find(
        filter,
        {
          name: 1,
          code: 1,
          division: 1,
          district: 1,
          address: 1,
          contact_number: 1,
          type: 1,
          parent_office_id: 1,
          is_active: 1,
          capabilities: 1,
          created_at: 1,
        }
      )
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      res.json(data);
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await OfficeModel.findById(readParamId(req, 'id')).lean();
      if (!data) return res.status(404).json({ message: 'Not found' });
      return res.json(data);
    } catch (error) {
      next(error);
    }
  },
  create: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const payload = buildPayload(req.body);
      const type = String(payload.type || '');
      const payloadCapabilities = asRecord(payload.capabilities);
      if (type === 'DISTRICT_LAB') {
        payload.capabilities = { ...(payloadCapabilities || {}), chemicals: true };
      } else if (payloadCapabilities) {
        payload.capabilities = { ...payloadCapabilities, chemicals: false };
      }
      const data = await OfficeModel.create(payload);
      return res.status(201).json(data.toJSON());
    } catch (error) {
      next(error);
    }
  },
  update: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const officeId = readParamId(req, 'id');
      const payload = buildPayload(req.body);
      const existing = await OfficeModel.findById(officeId);
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

      const data = await OfficeModel.findByIdAndUpdate(officeId, payload, { new: true });
      if (!data) return res.status(404).json({ message: 'Not found' });
      return res.json(data.toJSON());
    } catch (error) {
      next(error);
    }
  },
  remove: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await OfficeModel.findByIdAndDelete(readParamId(req, 'id'));
      if (!data) return res.status(404).json({ message: 'Not found' });
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};

