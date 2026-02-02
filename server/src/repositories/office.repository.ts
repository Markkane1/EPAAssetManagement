import { OfficeModel } from '../models/office.model';
import { createRepository } from './baseRepository';

export const officeRepository = createRepository(OfficeModel);
