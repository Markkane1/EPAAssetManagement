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

export const districtController = {
  ...baseController,
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { divisionId } = req.query;
      const filter: Record<string, unknown> = {};
      if (divisionId) {
        filter.division_id = divisionId;
      }
      const data = await DistrictModel.find(filter).sort({ created_at: -1 });
      res.json(data);
    } catch (error) {
      next(error);
    }
  },
};
