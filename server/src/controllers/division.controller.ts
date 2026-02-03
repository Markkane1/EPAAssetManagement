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

export const divisionController = {
  ...baseController,
  list: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await DivisionModel.find().sort({ created_at: -1 });
      res.json(data);
    } catch (error) {
      next(error);
    }
  },
};
