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

const buildPayload = (body: Record<string, unknown>) => {
  const payload = mapFields(body, fieldMap);
  Object.values(fieldMap).forEach((dbKey) => {
    if (body[dbKey] !== undefined) {
      payload[dbKey] = body[dbKey];
    }
  });
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
      res.json(data);
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await OfficeModel.findById(req.params.id).lean();
      if (!data) return res.status(404).json({ message: 'Not found' });
      return res.json(data);
    } catch (error) {
      next(error);
    }
  },
  create: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const payload = buildPayload(req.body);
      if (payload.is_headoffice && req.user?.role !== 'super_admin') {
        return res.status(403).json({ message: 'Only super admin can designate head office' });
      }
      if (!payload.capabilities && payload.type === 'LAB') {
        payload.capabilities = { chemicals: true };
      }
      const data = await OfficeModel.create(payload);
      return res.status(201).json(data);
    } catch (error) {
      next(error);
    }
  },
  update: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const payload = buildPayload(req.body);
      if (payload.is_headoffice !== undefined && req.user?.role !== 'super_admin') {
        return res.status(403).json({ message: 'Only super admin can modify head office designation' });
      }
      const data = await OfficeModel.findByIdAndUpdate(req.params.id, payload, { new: true });
      if (!data) return res.status(404).json({ message: 'Not found' });
      return res.json(data);
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
