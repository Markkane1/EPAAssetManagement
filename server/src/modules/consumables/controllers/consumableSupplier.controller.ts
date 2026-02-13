import { Request, Response, NextFunction } from 'express';
import { ConsumableSupplierModel } from '../models/consumableSupplier.model';
import { mapFields, pickDefined } from '../../../utils/mapFields';

const fieldMap = {
  contactName: 'contact_name',
  email: 'email',
  phone: 'phone',
  address: 'address',
  notes: 'notes',
};

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildPayload(body: Record<string, unknown>) {
  const payload = mapFields(body, fieldMap);
  Object.values(fieldMap).forEach((dbKey) => {
    if (body[dbKey] !== undefined) {
      payload[dbKey] = body[dbKey];
    }
  });
  if (body.name !== undefined) payload.name = body.name;
  return pickDefined(payload);
}

export const consumableSupplierController = {
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter: Record<string, unknown> = {};
      const search = String((req.query as Record<string, unknown>).search || '').trim();
      if (search) {
        filter.name = { $regex: new RegExp(escapeRegex(search), 'i') };
      }
      const limit = clampInt((req.query as Record<string, unknown>).limit, 500, 1, 2000);
      const page = clampInt((req.query as Record<string, unknown>).page, 1, 1, 100000);
      const skip = (page - 1) * limit;
      const suppliers = await ConsumableSupplierModel.find(filter)
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean();
      res.json(suppliers);
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const supplier = await ConsumableSupplierModel.findById(req.params.id).lean();
      if (!supplier) return res.status(404).json({ message: 'Not found' });
      return res.json(supplier);
    } catch (error) {
      next(error);
    }
  },
  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = buildPayload(req.body);
      const supplier = await ConsumableSupplierModel.create(payload);
      res.status(201).json(supplier);
    } catch (error) {
      next(error);
    }
  },
  update: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = buildPayload(req.body);
      const supplier = await ConsumableSupplierModel.findByIdAndUpdate(req.params.id, payload, { new: true });
      if (!supplier) return res.status(404).json({ message: 'Not found' });
      return res.json(supplier);
    } catch (error) {
      next(error);
    }
  },
  remove: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const supplier = await ConsumableSupplierModel.findByIdAndDelete(req.params.id);
      if (!supplier) return res.status(404).json({ message: 'Not found' });
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
