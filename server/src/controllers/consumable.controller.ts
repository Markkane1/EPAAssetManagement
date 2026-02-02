import { Request, Response, NextFunction } from 'express';
import { ConsumableModel } from '../models/consumable.model';
import { ConsumableAssignmentModel } from '../models/consumableAssignment.model';
import { mapFields } from '../utils/mapFields';

const fieldMap = {
  categoryId: 'category_id',
  totalQuantity: 'total_quantity',
  availableQuantity: 'available_quantity',
  isActive: 'is_active',
  acquisitionDate: 'acquisition_date',
};

function buildPayload(body: Record<string, unknown>) {
  const payload = mapFields(body, fieldMap);
  Object.values(fieldMap).forEach((dbKey) => {
    if (body[dbKey] !== undefined) {
      payload[dbKey] = body[dbKey];
    }
  });

  if (body.name !== undefined) payload.name = body.name;
  if (body.description !== undefined) payload.description = body.description;
  if (body.unit !== undefined) payload.unit = body.unit;
  if (body.acquisition_date !== undefined) payload.acquisition_date = body.acquisition_date;

  return payload;
}

export const consumableController = {
  list: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const items = await ConsumableModel.find().sort({ created_at: -1 });
      res.json(items);
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const item = await ConsumableModel.findById(req.params.id);
      if (!item) return res.status(404).json({ message: 'Not found' });
      return res.json(item);
    } catch (error) {
      next(error);
    }
  },
  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = buildPayload(req.body);
      if (!payload.name || !payload.unit) {
        return res.status(400).json({ message: 'Name and unit are required' });
      }
      const total = Number(payload.total_quantity ?? payload.totalQuantity ?? 0);
      if (!Number.isFinite(total) || total < 0) {
        return res.status(400).json({ message: 'Total quantity cannot be less than 0' });
      }
      const available = payload.available_quantity !== undefined
        ? Number(payload.available_quantity)
        : total;
      if (!Number.isFinite(available) || available < 0 || available > total) {
        return res.status(400).json({ message: 'Available quantity cannot be less than 0 or exceed total' });
      }

      const item = await ConsumableModel.create({
        ...payload,
        total_quantity: total,
        available_quantity: available,
        acquisition_date: payload.acquisition_date || new Date().toISOString().split('T')[0],
      });
      res.status(201).json(item);
    } catch (error) {
      next(error);
    }
  },
  update: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await ConsumableModel.findById(req.params.id);
      if (!existing) return res.status(404).json({ message: 'Not found' });

      const payload = buildPayload(req.body);
      const nextTotal =
        payload.total_quantity !== undefined ? Number(payload.total_quantity) : existing.total_quantity;
      if (!Number.isFinite(nextTotal) || nextTotal < 0) {
        return res.status(400).json({ message: 'Total quantity cannot be less than 0' });
      }

      const used = existing.total_quantity - existing.available_quantity;
      if (nextTotal < used) {
        return res.status(400).json({ message: 'Total quantity cannot be less than assigned quantity' });
      }
      const nextAvailable =
        payload.available_quantity !== undefined
          ? Number(payload.available_quantity)
          : Math.max(nextTotal - used, 0);

      if (!Number.isFinite(nextAvailable) || nextAvailable < 0 || nextAvailable > nextTotal) {
        return res.status(400).json({ message: 'Available quantity cannot be less than 0 or exceed total' });
      }

      const updated = await ConsumableModel.findByIdAndUpdate(
        req.params.id,
        {
          ...payload,
          total_quantity: nextTotal,
          available_quantity: nextAvailable,
        },
        { new: true }
      );
      if (!updated) return res.status(404).json({ message: 'Not found' });
      return res.json(updated);
    } catch (error) {
      next(error);
    }
  },
  remove: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const removed = await ConsumableModel.findByIdAndDelete(req.params.id);
      if (!removed) return res.status(404).json({ message: 'Not found' });
      await ConsumableAssignmentModel.deleteMany({ consumable_id: removed.id });
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
