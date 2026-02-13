import { Request, Response, NextFunction } from 'express';
import { ConsumableItemModel } from '../models/consumableItem.model';
import { mapFields, pickDefined } from '../../../utils/mapFields';
import type { AuthRequest } from '../../../middleware/auth';
import { createHttpError } from '../utils/httpError';
import { getUnitLookup } from '../services/consumableUnit.service';
import { normalizeUom } from '../utils/unitConversion';

const fieldMap = {
  casNumber: 'cas_number',
  categoryId: 'category_id',
  baseUom: 'base_uom',
  isHazardous: 'is_hazardous',
  isControlled: 'is_controlled',
  isChemical: 'is_chemical',
  requiresLotTracking: 'requires_lot_tracking',
  requiresContainerTracking: 'requires_container_tracking',
  defaultMinStock: 'default_min_stock',
  defaultReorderPoint: 'default_reorder_point',
  storageCondition: 'storage_condition',
  createdBy: 'created_by',
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
  if (payload.category_id === '') payload.category_id = null;

  if (payload.is_controlled === true && payload.requires_container_tracking === undefined) {
    payload.requires_container_tracking = true;
  }

  return pickDefined(payload);
}

export const consumableItemController = {
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as Record<string, unknown>;
      const filter: Record<string, unknown> = {};
      const search = String(query.search || '').trim();
      if (search) {
        const regex = new RegExp(escapeRegex(search), 'i');
        filter.$or = [{ name: regex }, { cas_number: regex }];
      }
      const limit = clampInt(query.limit, 1000, 1, 2000);
      const page = clampInt(query.page, 1, 1, 100000);
      const skip = (page - 1) * limit;
      const items = await ConsumableItemModel.find(filter)
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean();
      res.json(items);
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const item = await ConsumableItemModel.findById(req.params.id).lean();
      if (!item) return res.status(404).json({ message: 'Not found' });
      return res.json(item);
    } catch (error) {
      next(error);
    }
  },
  create: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const payload = buildPayload(req.body);
      if (payload.base_uom) {
        const lookup = await getUnitLookup({ activeOnly: true });
        payload.base_uom = normalizeUom(String(payload.base_uom), lookup);
      } else {
        throw createHttpError(400, 'Base UoM is required');
      }
      if (!payload.created_by && req.user?.userId) {
        payload.created_by = req.user.userId;
      }
      const item = await ConsumableItemModel.create(payload);
      res.status(201).json(item);
    } catch (error) {
      next(error);
    }
  },
  update: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = buildPayload(req.body);
      if (payload.base_uom) {
        const lookup = await getUnitLookup({ activeOnly: true });
        payload.base_uom = normalizeUom(String(payload.base_uom), lookup);
      }
      const item = await ConsumableItemModel.findByIdAndUpdate(req.params.id, payload, { new: true });
      if (!item) return res.status(404).json({ message: 'Not found' });
      return res.json(item);
    } catch (error) {
      next(error);
    }
  },
  remove: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const item = await ConsumableItemModel.findByIdAndDelete(req.params.id);
      if (!item) return res.status(404).json({ message: 'Not found' });
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
