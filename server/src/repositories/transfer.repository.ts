import { TransferHistoryModel } from '../models/transferHistory.model';
import { createRepository } from './baseRepository';

export const transferRepository = createRepository(TransferHistoryModel);
