import { Request, Response, NextFunction } from 'express';
import { ConsumableUnitModel } from '../models/consumableUnit.model';
import { mapFields, pickDefined } from '../../../utils/mapFields';
import { createHttpError } from '../utils/httpError';
import { clearUnitCache } from '../services/consumableUnit.service';

const fieldMap = {
  toBase: 'to_base',
  isActive: 'is_active',
};

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeAliases(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const cleaned = value
    .map((item) => String(item).trim())
    .filter((item) => item.length > 0);
  return Array.from(new Set(cleaned));
}

function buildPayload(body: Record<string, unknown>) {
  const payload = mapFields(body, fieldMap);
  Object.values(fieldMap).forEach((dbKey) => {
    if (body[dbKey] !== undefined) {
      payload[dbKey] = body[dbKey];
    }
  });
  if (body.code !== undefined) payload.code = String(body.code).trim();
  if (body.name !== undefined) payload.name = String(body.name).trim();
  if (body.group !== undefined) payload.group = body.group;
  if (body.aliases !== undefined) payload.aliases = normalizeAliases(body.aliases);
  return pickDefined(payload);
}

async function ensureUniqueCode(code: string, excludeId?: string) {
  const regex = new RegExp(`^${escapeRegex(code)}$`, 'i');
  const filter: Record<string, unknown> = { code: regex };
  if (excludeId) {
    filter._id = { $ne: excludeId };
  }
  const existing = await ConsumableUnitModel.findOne(filter, { _id: 1 }).lean();
  if (existing) {
    throw createHttpError(400, 'Unit code already exists');
  }
}

export const consumableUnitController = {
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter: Record<string, unknown> = {};
      if (req.query.active !== undefined) {
        const active = String(req.query.active).toLowerCase();
        filter.is_active = active === 'true' || active === '1';
      }
      if (req.query.group) {
        filter.group = req.query.group;
      }
      const limit = clampInt((req.query as Record<string, unknown>).limit, 500, 1, 2000);
      const page = clampInt((req.query as Record<string, unknown>).page, 1, 1, 100000);
      const skip = (page - 1) * limit;
      const units = await ConsumableUnitModel.find(filter)
        .sort({ group: 1, to_base: 1, code: 1 })
        .skip(skip)
        .limit(limit)
        .lean();
      res.json(units);
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const unit = await ConsumableUnitModel.findById(req.params.id).lean();
      if (!unit) return res.status(404).json({ message: 'Not found' });
      return res.json(unit);
    } catch (error) {
      next(error);
    }
  },
  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = buildPayload(req.body);
      if (!payload.code || !payload.name || !payload.group || payload.to_base === undefined) {
        throw createHttpError(400, 'Unit code, name, group, and conversion factor are required');
      }
      await ensureUniqueCode(payload.code);
      const unit = await ConsumableUnitModel.create(payload);
      clearUnitCache();
      res.status(201).json(unit);
    } catch (error) {
      next(error);
    }
  },
  update: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = buildPayload(req.body);
      if (payload.code) {
        await ensureUniqueCode(payload.code, req.params.id);
      }
      const unit = await ConsumableUnitModel.findByIdAndUpdate(req.params.id, payload, { new: true });
      if (!unit) return res.status(404).json({ message: 'Not found' });
      clearUnitCache();
      return res.json(unit);
    } catch (error) {
      next(error);
    }
  },
  remove: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const unit = await ConsumableUnitModel.findByIdAndDelete(req.params.id);
      if (!unit) return res.status(404).json({ message: 'Not found' });
      clearUnitCache();
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
