import { ProjectModel } from '../models/project.model';
import { createRepository } from './baseRepository';

export const projectRepository = createRepository(ProjectModel);
