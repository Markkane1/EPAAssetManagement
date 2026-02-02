import { PurchaseOrderModel } from '../models/purchaseOrder.model';
import { createRepository } from './baseRepository';

export const purchaseOrderRepository = createRepository(PurchaseOrderModel);
