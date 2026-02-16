import { Request, Response, NextFunction } from 'express';
import { createCrudController } from './crudController';
import { schemeRepository } from '../repositories/scheme.repository';
import { SchemeModel } from '../models/scheme.model';
import { escapeRegex, readPagination } from '../utils/requestParsing';

const baseController = createCrudController({
  repository: schemeRepository,
  createMap: {
    projectId: 'project_id',
    isActive: 'is_active',
  },
  updateMap: {
    projectId: 'project_id',
    isActive: 'is_active',
  },
});

export const schemeController = {
  ...baseController,
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { limit, skip } = readPagination(req.query as Record<string, unknown>, { defaultLimit: 200, maxLimit: 1000 });
      const search = String((req.query as Record<string, unknown>).search || '').trim();
      const filter: Record<string, unknown> = {};
      if (search) {
        filter.name = new RegExp(escapeRegex(search), 'i');
      }

      const schemes = await SchemeModel.find(filter, { name: 1, project_id: 1, description: 1, is_active: 1, created_at: 1 })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      res.json(schemes);
    } catch (error) {
      next(error);
    }
  },
  getByProject: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { limit, skip } = readPagination(req.query as Record<string, unknown>, { defaultLimit: 200, maxLimit: 1000 });
      const search = String((req.query as Record<string, unknown>).search || '').trim();
      const filter: Record<string, unknown> = { project_id: req.params.projectId };
      if (search) {
        filter.name = new RegExp(escapeRegex(search), 'i');
      }

      const schemes = await SchemeModel.find(filter, { name: 1, project_id: 1, description: 1, is_active: 1, created_at: 1 })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      res.json(schemes);
    } catch (error) {
      next(error);
    }
  },
};
