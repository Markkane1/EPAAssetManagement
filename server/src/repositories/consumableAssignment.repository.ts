import { createRepository } from './baseRepository';
import { ConsumableAssignmentModel } from '../models/consumableAssignment.model';

export const consumableAssignmentRepository = createRepository(ConsumableAssignmentModel);
