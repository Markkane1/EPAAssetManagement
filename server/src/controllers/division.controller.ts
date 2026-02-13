import { Request, Response, NextFunction } from 'express';
import { createCrudController } from './crudController';
import { DivisionModel } from '../models/division.model';

const baseController = createCrudController({
  repository: {
    findAll: () => DivisionModel.find().sort({ created_at: -1 }),
    findById: (id: string) => DivisionModel.findById(id),
    create: (data: Record<string, unknown>) => DivisionModel.create(data),
    updateById: (id: string, data: Record<string, unknown>) =>
      DivisionModel.findByIdAndUpdate(id, data, { new: true }),
    deleteById: (id: string) => DivisionModel.findByIdAndDelete(id),
  },
});

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export const divisionController = {
  ...baseController,
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = clampInt((req.query as Record<string, unknown>).limit, 500, 1, 2000);
      const page = clampInt((req.query as Record<string, unknown>).page, 1, 1, 100000);
      const skip = (page - 1) * limit;
      const data = await DivisionModel.find()
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      res.json(data);
    } catch (error) {
      next(error);
    }
  },
};
