import { Request, Response, NextFunction } from 'express';
import { ConsumableContainerModel } from '../models/consumableContainer.model';
import { mapFields, pickDefined } from '../../../utils/mapFields';

const fieldMap = {
  lotId: 'lot_id',
  containerCode: 'container_code',
  initialQtyBase: 'initial_qty_base',
  currentQtyBase: 'current_qty_base',
  currentLocationId: 'current_location_id',
  status: 'status',
  openedDate: 'opened_date',
};

function buildPayload(body: Record<string, unknown>) {
  const payload = mapFields(body, fieldMap);
  Object.values(fieldMap).forEach((dbKey) => {
    if (body[dbKey] !== undefined) {
      payload[dbKey] = body[dbKey];
    }
  });
  return pickDefined(payload);
}

export const consumableContainerController = {
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter: Record<string, unknown> = {};
      if (req.query.lotId) filter.lot_id = req.query.lotId;
      if (req.query.locationId) filter.current_location_id = req.query.locationId;
      if (req.query.status) filter.status = req.query.status;
      const containers = await ConsumableContainerModel.find(filter).sort({ container_code: 1 });
      res.json(containers);
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const container = await ConsumableContainerModel.findById(req.params.id);
      if (!container) return res.status(404).json({ message: 'Not found' });
      return res.json(container);
    } catch (error) {
      next(error);
    }
  },
  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = buildPayload(req.body);
      const container = await ConsumableContainerModel.create(payload);
      res.status(201).json(container);
    } catch (error) {
      next(error);
    }
  },
  update: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = buildPayload(req.body);
      const container = await ConsumableContainerModel.findByIdAndUpdate(req.params.id, payload, { new: true });
      if (!container) return res.status(404).json({ message: 'Not found' });
      return res.json(container);
    } catch (error) {
      next(error);
    }
  },
  remove: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const container = await ConsumableContainerModel.findByIdAndDelete(req.params.id);
      if (!container) return res.status(404).json({ message: 'Not found' });
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
