import { Request, Response, NextFunction } from 'express';
import { PurchaseOrderModel } from '../models/purchaseOrder.model';
import { mapFields } from '../utils/mapFields';

const fieldMap = {
  orderNumber: 'order_number',
  orderDate: 'order_date',
  expectedDeliveryDate: 'expected_delivery_date',
  deliveredDate: 'delivered_date',
  totalAmount: 'total_amount',
  vendorId: 'vendor_id',
  projectId: 'project_id',
};

function buildPayload(body: Record<string, unknown>) {
  const payload = mapFields(body, fieldMap);
  Object.values(fieldMap).forEach((dbKey) => {
    if (body[dbKey] !== undefined) {
      payload[dbKey] = body[dbKey];
    }
  });
  if (body.status !== undefined) payload.status = body.status;
  if (body.notes !== undefined) payload.notes = body.notes;
  return payload;
}

export const purchaseOrderController = {
  list: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const orders = await PurchaseOrderModel.find().sort({ order_date: -1 });
      res.json(orders);
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const order = await PurchaseOrderModel.findById(req.params.id);
      if (!order) return res.status(404).json({ message: 'Not found' });
      return res.json(order);
    } catch (error) {
      next(error);
    }
  },
  getByVendor: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orders = await PurchaseOrderModel.find({ vendor_id: req.params.vendorId })
        .sort({ order_date: -1 });
      res.json(orders);
    } catch (error) {
      next(error);
    }
  },
  getByProject: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orders = await PurchaseOrderModel.find({ project_id: req.params.projectId })
        .sort({ order_date: -1 });
      res.json(orders);
    } catch (error) {
      next(error);
    }
  },
  getPending: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const orders = await PurchaseOrderModel.find({ status: { $in: ['Draft', 'Pending'] } })
        .sort({ order_date: -1 });
      res.json(orders);
    } catch (error) {
      next(error);
    }
  },
  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = buildPayload(req.body);
      if (!payload.order_number) {
        payload.order_number = `PO-${Date.now()}`;
      }
      if (!payload.status) payload.status = 'Draft';
      const order = await PurchaseOrderModel.create(payload);
      res.status(201).json(order);
    } catch (error) {
      next(error);
    }
  },
  update: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = buildPayload(req.body);
      const order = await PurchaseOrderModel.findByIdAndUpdate(req.params.id, payload, { new: true });
      if (!order) return res.status(404).json({ message: 'Not found' });
      return res.json(order);
    } catch (error) {
      next(error);
    }
  },
  remove: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const order = await PurchaseOrderModel.findByIdAndDelete(req.params.id);
      if (!order) return res.status(404).json({ message: 'Not found' });
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
