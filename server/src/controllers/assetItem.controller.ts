import { Request, Response, NextFunction } from 'express';
import { AssetItemModel } from '../models/assetItem.model';
import { AssetModel } from '../models/asset.model';
import { OfficeModel } from '../models/office.model';
import { mapFields } from '../utils/mapFields';

const fieldMap = {
  assetId: 'asset_id',
  locationId: 'location_id',
  serialNumber: 'serial_number',
  assignmentStatus: 'assignment_status',
  itemStatus: 'item_status',
  itemCondition: 'item_condition',
  functionalStatus: 'functional_status',
  itemSource: 'item_source',
  purchaseDate: 'purchase_date',
  warrantyExpiry: 'warranty_expiry',
};

function buildPayload(body: Record<string, unknown>) {
  const payload = mapFields(body, fieldMap);
  Object.values(fieldMap).forEach((dbKey) => {
    if (body[dbKey] !== undefined) {
      payload[dbKey] = body[dbKey];
    }
  });

  if (body.tag !== undefined) payload.tag = body.tag;
  if (body.notes !== undefined) payload.notes = body.notes;

  return payload;
}

function generateAssetTag(assetId: string, index: number) {
  const suffix = assetId.slice(-6).toUpperCase();
  const sequence = String(index).padStart(4, '0');
  return `AST-${suffix}-${sequence}`;
}

async function getDefaultLocationId() {
  const location = await OfficeModel.findOne({ name: /^head\\s*office$/i });
  return location ? location.id : null;
}

export const assetItemController = {
  list: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const items = await AssetItemModel.find().sort({ created_at: -1 });
      res.json(items);
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const item = await AssetItemModel.findById(req.params.id);
      if (!item) return res.status(404).json({ message: 'Not found' });
      return res.json(item);
    } catch (error) {
      next(error);
    }
  },
  getByAsset: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const items = await AssetItemModel.find({ asset_id: req.params.assetId }).sort({ created_at: -1 });
      res.json(items);
    } catch (error) {
      next(error);
    }
  },
  getByLocation: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const items = await AssetItemModel.find({ location_id: req.params.locationId }).sort({ created_at: -1 });
      res.json(items);
    } catch (error) {
      next(error);
    }
  },
  getAvailable: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const items = await AssetItemModel.find({ item_status: 'Available', assignment_status: 'Unassigned' })
        .sort({ created_at: -1 });
      res.json(items);
    } catch (error) {
      next(error);
    }
  },
  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = buildPayload(req.body);
      if (payload.assignment_status === undefined) payload.assignment_status = 'Unassigned';
      if (payload.item_status === undefined) payload.item_status = 'Available';
      if (payload.item_condition === undefined) payload.item_condition = 'New';
      if (payload.functional_status === undefined) payload.functional_status = 'Functional';
      if (payload.item_source === undefined) payload.item_source = 'Purchased';
      if (!payload.asset_id) {
        return res.status(400).json({ message: 'Asset is required' });
      }

      const assetExists = await AssetModel.exists({ _id: payload.asset_id });
      if (!assetExists) {
        return res.status(404).json({ message: 'Asset not found' });
      }
      if (!payload.location_id) {
        payload.location_id = await getDefaultLocationId();
      }
      if (!payload.tag && payload.asset_id) {
        const existingCount = await AssetItemModel.countDocuments({ asset_id: payload.asset_id });
        payload.tag = generateAssetTag(String(payload.asset_id), existingCount + 1);
      }
      const item = await AssetItemModel.create(payload);
      res.status(201).json(item);
    } catch (error) {
      next(error);
    }
  },
  createBatch: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { assetId, locationId, itemStatus, itemCondition, functionalStatus, notes, items } = req.body as {
        assetId: string;
        locationId: string;
        itemStatus: string;
        itemCondition: string;
        functionalStatus?: string;
        notes?: string;
        items: Array<{ serialNumber: string; warrantyExpiry?: string }>;
      };

      if (!items || items.length === 0) {
        return res.status(400).json({ message: 'No items provided' });
      }

      const asset = await AssetModel.findById(assetId);
      if (!asset) return res.status(404).json({ message: 'Asset not found' });

      const existingCount = await AssetItemModel.countDocuments({ asset_id: assetId });
      const maxAllowed = asset.quantity || 0;
      if (maxAllowed > 0 && existingCount + items.length > maxAllowed) {
        return res.status(400).json({ message: `Only ${maxAllowed} items allowed for this asset` });
      }

      const docs = items.map((item, index) => ({
        asset_id: assetId,
        location_id: locationId,
        serial_number: item.serialNumber,
        warranty_expiry: item.warrantyExpiry || null,
        tag: generateAssetTag(assetId, existingCount + index + 1),
        assignment_status: 'Unassigned',
        item_status: itemStatus || 'Available',
        item_condition: itemCondition || 'New',
        functional_status: functionalStatus || 'Functional',
        item_source: 'Purchased',
        notes: notes || null,
      }));

      const created = await AssetItemModel.insertMany(docs);
      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  },
  update: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = buildPayload(req.body);
      const item = await AssetItemModel.findByIdAndUpdate(req.params.id, payload, { new: true });
      if (!item) return res.status(404).json({ message: 'Not found' });
      return res.json(item);
    } catch (error) {
      next(error);
    }
  },
  remove: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const item = await AssetItemModel.findByIdAndDelete(req.params.id);
      if (!item) return res.status(404).json({ message: 'Not found' });
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
