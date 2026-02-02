import { createRepository } from './baseRepository';
import { ConsumableModel } from '../models/consumable.model';

export const consumableRepository = createRepository(ConsumableModel);
