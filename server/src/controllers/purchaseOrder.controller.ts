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

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function readPagination(query: Record<string, unknown>) {
  const limit = clampInt(query.limit, 1000, 1, 2000);
  const page = clampInt(query.page, 1, 1, 100000);
  const skip = (page - 1) * limit;
  return { limit, skip };
}

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
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { limit, skip } = readPagination(req.query as Record<string, unknown>);
      const orders = await PurchaseOrderModel.find()
        .sort({ order_date: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      res.json(orders);
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const order = await PurchaseOrderModel.findById(req.params.id).lean();
      if (!order) return res.status(404).json({ message: 'Not found' });
      return res.json(order);
    } catch (error) {
      next(error);
    }
  },
  getByVendor: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { limit, skip } = readPagination(req.query as Record<string, unknown>);
      const orders = await PurchaseOrderModel.find({ vendor_id: req.params.vendorId })
        .sort({ order_date: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      res.json(orders);
    } catch (error) {
      next(error);
    }
  },
  getByProject: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { limit, skip } = readPagination(req.query as Record<string, unknown>);
      const orders = await PurchaseOrderModel.find({ project_id: req.params.projectId })
        .sort({ order_date: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      res.json(orders);
    } catch (error) {
      next(error);
    }
  },
  getPending: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { limit, skip } = readPagination(req.query as Record<string, unknown>);
      const orders = await PurchaseOrderModel.find({ status: { $in: ['Draft', 'Pending'] } })
        .sort({ order_date: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
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
