import { Request, Response, NextFunction } from 'express';
import { ConsumableReasonCodeModel } from '../models/consumableReasonCode.model';

export const consumableReasonCodeController = {
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter: Record<string, unknown> = {};
      if (req.query.category) filter.category = req.query.category;
      const codes = await ConsumableReasonCodeModel.find(filter).sort({ code: 1 });
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
