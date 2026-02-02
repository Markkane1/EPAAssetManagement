import { Request, Response, NextFunction } from 'express';
import { ConsumableSupplierModel } from '../models/consumableSupplier.model';
import { mapFields, pickDefined } from '../../../utils/mapFields';

const fieldMap = {
  contactName: 'contact_name',
  email: 'email',
  phone: 'phone',
  address: 'address',
  notes: 'notes',
};

function buildPayload(body: Record<string, unknown>) {
  const payload = mapFields(body, fieldMap);
  Object.values(fieldMap).forEach((dbKey) => {
    if (body[dbKey] !== undefined) {
      payload[dbKey] = body[dbKey];
    }
  });
  if (body.name !== undefined) payload.name = body.name;
  return pickDefined(payload);
}

export const consumableSupplierController = {
  list: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const suppliers = await ConsumableSupplierModel.find().sort({ name: 1 });
      res.json(suppliers);
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const supplier = await ConsumableSupplierModel.findById(req.params.id);
      if (!supplier) return res.status(404).json({ message: 'Not found' });
      return res.json(supplier);
    } catch (error) {
      next(error);
    }
  },
  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = buildPayload(req.body);
      const supplier = await ConsumableSupplierModel.create(payload);
      res.status(201).json(supplier);
    } catch (error) {
      next(error);
    }
  },
  update: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = buildPayload(req.body);
      const supplier = await ConsumableSupplierModel.findByIdAndUpdate(req.params.id, payload, { new: true });
      if (!supplier) return res.status(404).json({ message: 'Not found' });
      return res.json(supplier);
    } catch (error) {
      next(error);
    }
  },
  remove: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const supplier = await ConsumableSupplierModel.findByIdAndDelete(req.params.id);
      if (!supplier) return res.status(404).json({ message: 'Not found' });
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
