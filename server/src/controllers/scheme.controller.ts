import { Request, Response, NextFunction } from 'express';
import { createCrudController } from './crudController';
import { schemeRepository } from '../repositories/scheme.repository';

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
  getByProject: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schemes = await schemeRepository.findAll();
      const filtered = schemes.filter((scheme: any) =>
        scheme.project_id?.toString() === req.params.projectId
      );
      res.json(filtered);
    } catch (error) {
      next(error);
    }
  },
};
