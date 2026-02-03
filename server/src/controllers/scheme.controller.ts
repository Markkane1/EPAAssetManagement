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
      type SchemeLike = { project_id?: { toString(): string } | string | null };
      const filtered = schemes.filter((scheme) => {
        const projectId = (scheme as SchemeLike).project_id;
        return projectId?.toString() === req.params.projectId;
      });
      res.json(filtered);
    } catch (error) {
      next(error);
    }
  },
};
