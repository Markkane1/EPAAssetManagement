import { Request, Response, NextFunction } from 'express';
import { ConsumableReasonCodeModel } from '../models/consumableReasonCode.model';

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export const consumableReasonCodeController = {
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter: Record<string, unknown> = {};
      if (req.query.category) filter.category = req.query.category;
      const limit = clampInt((req.query as Record<string, unknown>).limit, 500, 1, 2000);
      const page = clampInt((req.query as Record<string, unknown>).page, 1, 1, 100000);
      const skip = (page - 1) * limit;
      const codes = await ConsumableReasonCodeModel.find(filter)
        .sort({ code: 1 })
        .skip(skip)
        .limit(limit)
        .lean();
      res.json(codes);
    } catch (error) {
      next(error);
    }
  },
  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const code = await ConsumableReasonCodeModel.create(req.body);
      res.status(201).json(code);
    } catch (error) {
      next(error);
    }
  },
};
