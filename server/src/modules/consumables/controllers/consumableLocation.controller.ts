import { Request, Response, NextFunction } from 'express';
import { OfficeModel } from '../../../models/office.model';
import { mapFields, pickDefined } from '../../../utils/mapFields';
import { supportsChemicals, supportsConsumables } from '../utils/officeCapabilities';

const fieldMap = {
  name: 'name',
  division: 'division',
  district: 'district',
  address: 'address',
  contactNumber: 'contact_number',
  type: 'type',
  parentLocationId: 'parent_location_id',
  labCode: 'lab_code',
  isActive: 'is_active',
  capabilities: 'capabilities',
};

function buildPayload(body: Record<string, unknown>) {
  const payload = mapFields(body, fieldMap);
  Object.values(fieldMap).forEach((dbKey) => {
    if (body[dbKey] !== undefined) {
      payload[dbKey] = body[dbKey];
    }
  });
  if (payload.parent_location_id === '') payload.parent_location_id = null;
  if (body.capabilities !== undefined) payload.capabilities = body.capabilities;
  if (!payload.capabilities && payload.type === 'LAB') {
    payload.capabilities = { chemicals: true };
  }
  return pickDefined(payload);
}

export const consumableLocationController = {
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter: Record<string, unknown> = {};
      if (req.query.type) filter.type = req.query.type;
      if (req.query.isActive !== undefined) filter.is_active = req.query.isActive === 'true';
      const capability = String(req.query.capability || '').toLowerCase();
      let locations = await OfficeModel.find(filter).sort({ name: 1 });
      if (capability === 'chemicals') {
        locations = locations.filter((loc) => supportsChemicals(loc));
      }
      if (capability === 'consumables') {
        locations = locations.filter((loc) => supportsConsumables(loc));
      }
      res.json(locations);
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const location = await OfficeModel.findById(req.params.id);
      if (!location) return res.status(404).json({ message: 'Not found' });
      return res.json(location);
    } catch (error) {
      next(error);
    }
  },
  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = buildPayload(req.body);
      const location = await OfficeModel.create(payload);
      res.status(201).json(location);
    } catch (error) {
      next(error);
    }
  },
  update: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = buildPayload(req.body);
      const location = await OfficeModel.findByIdAndUpdate(req.params.id, payload, { new: true });
      if (!location) return res.status(404).json({ message: 'Not found' });
      return res.json(location);
    } catch (error) {
      next(error);
    }
  },
  remove: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const location = await OfficeModel.findByIdAndDelete(req.params.id);
      if (!location) return res.status(404).json({ message: 'Not found' });
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
