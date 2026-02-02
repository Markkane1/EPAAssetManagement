import { AssignmentModel } from '../models/assignment.model';
import { createRepository } from './baseRepository';

export const assignmentRepository = createRepository(AssignmentModel);
