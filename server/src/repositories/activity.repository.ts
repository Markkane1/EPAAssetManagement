import { ActivityLogModel } from '../models/activityLog.model';
import { createRepository } from './baseRepository';

export const activityRepository = createRepository(ActivityLogModel);
