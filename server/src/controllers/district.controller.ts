import { Request, Response, NextFunction } from 'express';
import { createCrudController } from './crudController';
import { DistrictModel } from '../models/district.model';

const baseController = createCrudController({
  repository: {
    findAll: () => DistrictModel.find().sort({ created_at: -1 }),
    findById: (id: string) => DistrictModel.findById(id),
    create: (data: Record<string, unknown>) => DistrictModel.create(data),
    updateById: (id: string, data: Record<string, unknown>) =>
      DistrictModel.findByIdAndUpdate(id, data, { new: true }),
    deleteById: (id: string) => DistrictModel.findByIdAndDelete(id),
  },
});

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export const districtController = {
  ...baseController,
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { divisionId } = req.query;
      const filter: Record<string, unknown> = {};
      if (divisionId) {
        filter.division_id = divisionId;
      }
      const limit = clampInt((req.query as Record<string, unknown>).limit, 500, 1, 2000);
      const page = clampInt((req.query as Record<string, unknown>).page, 1, 1, 100000);
      const skip = (page - 1) * limit;
      const data = await DistrictModel.find(filter)
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
