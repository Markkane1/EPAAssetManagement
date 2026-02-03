import { Request, Response, NextFunction } from 'express';
import { createCrudController } from './crudController';
import { projectRepository } from '../repositories/project.repository';

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
  getActive: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const projects = await projectRepository.findAll();
      type ProjectLike = { is_active?: boolean | null };
      const active = projects.filter((project) => Boolean((project as ProjectLike).is_active));
      res.json(active);
    } catch (error) {
      next(error);
    }
  },
};
