import { MaintenanceRecordModel } from '../models/maintenanceRecord.model';
import { createRepository } from './baseRepository';

export const maintenanceRepository = createRepository(MaintenanceRecordModel);
