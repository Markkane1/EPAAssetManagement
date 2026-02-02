import { Request, Response, NextFunction } from 'express';
import { ConsumableLotModel } from '../models/consumableLot.model';
import { mapFields, pickDefined } from '../../../utils/mapFields';

const fieldMap = {
  itemId: 'consumable_item_id',
  supplierId: 'supplier_id',
  lotNumber: 'lot_number',
  receivedDate: 'received_date',
  expiryDate: 'expiry_date',
};

function buildPayload(body: Record<string, unknown>) {
  const payload = mapFields(body, fieldMap);
  Object.values(fieldMap).forEach((dbKey) => {
    if (body[dbKey] !== undefined) {
      payload[dbKey] = body[dbKey];
    }
  });
  if (body.docs !== undefined) {
    payload.docs = body.docs;
  }
  return pickDefined(payload);
}

export const consumableLotController = {
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter: Record<string, unknown> = {};
      if (req.query.itemId) filter.consumable_item_id = req.query.itemId;
      if (req.query.supplierId) filter.supplier_id = req.query.supplierId;
      if (req.query.lotNumber) filter.lot_number = req.query.lotNumber;
      const lots = await ConsumableLotModel.find(filter).sort({ expiry_date: 1, received_date: -1 });
      res.json(lots);
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const lot = await ConsumableLotModel.findById(req.params.id);
      if (!lot) return res.status(404).json({ message: 'Not found' });
      return res.json(lot);
    } catch (error) {
      next(error);
    }
  },
  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = buildPayload(req.body);
      const lot = await ConsumableLotModel.create(payload);
      res.status(201).json(lot);
    } catch (error) {
      next(error);
    }
  },
  update: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = buildPayload(req.body);
      const lot = await ConsumableLotModel.findByIdAndUpdate(req.params.id, payload, { new: true });
      if (!lot) return res.status(404).json({ message: 'Not found' });
      return res.json(lot);
    } catch (error) {
      next(error);
    }
  },
  remove: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const lot = await ConsumableLotModel.findByIdAndDelete(req.params.id);
      if (!lot) return res.status(404).json({ message: 'Not found' });
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
