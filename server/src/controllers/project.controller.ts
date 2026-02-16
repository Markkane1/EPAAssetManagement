import { Request, Response, NextFunction } from 'express';
import { createCrudController } from './crudController';
import { projectRepository } from '../repositories/project.repository';
import { ProjectModel } from '../models/project.model';
import { escapeRegex, readPagination } from '../utils/requestParsing';

const baseController = createCrudController({
  repository: projectRepository,
  createMap: {
    startDate: 'start_date',
    endDate: 'end_date',
    isActive: 'is_active',
  },
  updateMap: {
    startDate: 'start_date',
    endDate: 'end_date',
    isActive: 'is_active',
  },
});

export const projectController = {
  ...baseController,
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { limit, skip } = readPagination(req.query as Record<string, unknown>, { defaultLimit: 200, maxLimit: 1000 });
      const search = String((req.query as Record<string, unknown>).search || '').trim();
      const filter: Record<string, unknown> = {};
      if (search) {
        const regex = new RegExp(escapeRegex(search), 'i');
        filter.$or = [{ name: regex }, { code: regex }];
      }

      const projects = await ProjectModel.find(
        filter,
        { name: 1, code: 1, description: 1, start_date: 1, end_date: 1, budget: 1, is_active: 1, created_at: 1 }
      )
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      res.json(projects);
    } catch (error) {
      next(error);
    }
  },
  getActive: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { limit, skip } = readPagination(req.query as Record<string, unknown>, { defaultLimit: 200, maxLimit: 1000 });
      const search = String((req.query as Record<string, unknown>).search || '').trim();
      const filter: Record<string, unknown> = { is_active: true };
      if (search) {
        const regex = new RegExp(escapeRegex(search), 'i');
        filter.$or = [{ name: regex }, { code: regex }];
      }

      const projects = await ProjectModel.find(filter, { name: 1, code: 1, start_date: 1, end_date: 1, is_active: 1 })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      res.json(projects);
    } catch (error) {
      next(error);
    }
  },
};
