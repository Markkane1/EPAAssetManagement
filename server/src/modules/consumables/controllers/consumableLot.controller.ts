import { Request, Response, NextFunction } from 'express';
import { ConsumableLotModel } from '../models/consumableLot.model';

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseBooleanFlag(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n'].includes(normalized)) return false;
  return fallback;
}

export const consumableLotController = {
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter: Record<string, unknown> = {};
      if (req.query.holder_type) filter.holder_type = String(req.query.holder_type).toUpperCase();
      if (req.query.holder_id) filter.holder_id = req.query.holder_id;
      if (req.query.consumable_id) filter.consumable_id = req.query.consumable_id;
      if (req.query.batch_no) filter.batch_no = req.query.batch_no;
      if (!parseBooleanFlag(req.query.include_zero, false)) {
        (filter as any).$or = [{ qty_available: { $gt: 0 } }, { qty_available: { $exists: false } }];
      }
      const limit = clampInt((req.query as Record<string, unknown>).limit, 500, 1, 2000);
      const page = clampInt((req.query as Record<string, unknown>).page, 1, 1, 100000);
      const skip = (page - 1) * limit;
      const lots = await ConsumableLotModel.find(filter)
        .sort({ expiry_date: 1, received_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      res.json(lots);
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const lot = await ConsumableLotModel.findById(req.params.id).lean();
      if (!lot) return res.status(404).json({ message: 'Not found' });
      return res.json(lot);
    } catch (error) {
      next(error);
    }
  },
};
