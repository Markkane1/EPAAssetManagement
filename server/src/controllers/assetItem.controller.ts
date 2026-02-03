import { Response, NextFunction } from 'express';
import { AssetItemModel } from '../models/assetItem.model';
import { AssetModel } from '../models/asset.model';
import { OfficeModel } from '../models/office.model';
import { mapFields } from '../utils/mapFields';
import type { AuthRequest } from '../middleware/auth';
import { resolveAccessContext, ensureOfficeScope, isOfficeManager } from '../utils/accessControl';
import { createHttpError } from '../utils/httpError';

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
  if (payload.purchase_date) payload.purchase_date = new Date(String(payload.purchase_date));
  if (payload.warranty_expiry) payload.warranty_expiry = new Date(String(payload.warranty_expiry));

  return payload;
}

function generateAssetTag(assetId: string, index: number) {
  const suffix = assetId.slice(-6).toUpperCase();
  const sequence = String(index).padStart(4, '0');
  return `AST-${suffix}-${sequence}`;
}

async function getDefaultLocationId() {
  const location = await OfficeModel.findOne({ is_headoffice: true });
  return location ? location.id : null;
}

export const assetItemController = {
  list: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      const filter: Record<string, unknown> = { is_active: { $ne: false } };
      if (!access.isHeadofficeAdmin) {
        if (!access.officeId) throw createHttpError(403, 'User is not assigned to an office');
        filter.location_id = access.officeId;
      }
      const items = await AssetItemModel.find(filter).sort({ created_at: -1 });
      res.json(items);
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const item = await AssetItemModel.findById(req.params.id);
      if (!item) return res.status(404).json({ message: 'Not found' });
      const access = await resolveAccessContext(req.user);
      if (!access.isHeadofficeAdmin) {
        if (!item.location_id) throw createHttpError(403, 'Asset item is not assigned to an office');
        ensureOfficeScope(access, item.location_id.toString());
      }
      return res.json(item);
    } catch (error) {
      next(error);
    }
  },
  getByAsset: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      const filter: Record<string, unknown> = { asset_id: req.params.assetId, is_active: { $ne: false } };
      if (!access.isHeadofficeAdmin) {
        if (!access.officeId) throw createHttpError(403, 'User is not assigned to an office');
        filter.location_id = access.officeId;
      }
      const items = await AssetItemModel.find(filter).sort({ created_at: -1 });
      res.json(items);
    } catch (error) {
      next(error);
    }
  },
  getByLocation: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      if (!access.isHeadofficeAdmin) {
        ensureOfficeScope(access, req.params.locationId);
      }
      const items = await AssetItemModel.find({
        location_id: req.params.locationId,
        is_active: { $ne: false },
      }).sort({ created_at: -1 });
      res.json(items);
    } catch (error) {
      next(error);
    }
  },
  getAvailable: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      const filter: Record<string, unknown> = {
        item_status: 'Available',
        assignment_status: 'Unassigned',
        is_active: { $ne: false },
      };
      if (!access.isHeadofficeAdmin) {
        if (!access.officeId) throw createHttpError(403, 'User is not assigned to an office');
        filter.location_id = access.officeId;
      }
      const items = await AssetItemModel.find(filter).sort({ created_at: -1 });
      res.json(items);
    } catch (error) {
      next(error);
    }
  },
  create: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      if (!access.isHeadofficeAdmin) {
        throw createHttpError(403, 'Only Head Office Admin can create asset items');
      }
      const payload = buildPayload(req.body);
      if (payload.assignment_status === undefined) payload.assignment_status = 'Unassigned';
      if (payload.item_status === undefined) payload.item_status = 'Available';
      if (payload.item_condition === undefined) payload.item_condition = 'New';
      if (payload.functional_status === undefined) payload.functional_status = 'Functional';
      if (payload.item_source === undefined) payload.item_source = 'Purchased';
      if (!payload.asset_id) {
        return res.status(400).json({ message: 'Asset is required' });
      }

      const asset = await AssetModel.findById(payload.asset_id);
      if (!asset) {
        return res.status(404).json({ message: 'Asset not found' });
      }
      if (asset.is_active === false) {
        return res.status(400).json({ message: 'Cannot create items for an inactive asset' });
      }
      if (!payload.location_id) {
        payload.location_id = await getDefaultLocationId();
      }
      if (!payload.location_id) {
        return res.status(400).json({ message: 'Head Office must be configured before creating items' });
      }
      const locationExists = await OfficeModel.exists({ _id: payload.location_id });
      if (!locationExists) {
        return res.status(404).json({ message: 'Office not found' });
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
  createBatch: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      if (!access.isHeadofficeAdmin) {
        throw createHttpError(403, 'Only Head Office Admin can create asset items');
      }
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
      if (asset.is_active === false) {
        return res.status(400).json({ message: 'Cannot create items for an inactive asset' });
      }

      const existingCount = await AssetItemModel.countDocuments({ asset_id: assetId });
      const maxAllowed = asset.quantity || 0;
      if (maxAllowed > 0 && existingCount + items.length > maxAllowed) {
        return res.status(400).json({ message: `Only ${maxAllowed} items allowed for this asset` });
      }

      const fallbackLocationId = locationId || (await getDefaultLocationId());
      if (!fallbackLocationId) {
        return res.status(400).json({ message: 'Head Office must be configured before creating items' });
      }
      const locationExists = await OfficeModel.exists({ _id: fallbackLocationId });
      if (!locationExists) {
        return res.status(404).json({ message: 'Office not found' });
      }

      const docs = items.map((item, index) => ({
        asset_id: assetId,
        location_id: fallbackLocationId,
        serial_number: item.serialNumber,
        warranty_expiry: item.warrantyExpiry || null,
        tag: generateAssetTag(assetId, existingCount + index + 1),
        assignment_status: 'Unassigned',
        item_status: itemStatus || 'Available',
        item_condition: itemCondition || 'New',
        functional_status: functionalStatus || 'Functional',
        item_source: 'Purchased',
        notes: notes || null,
        is_active: true,
      }));

      const created = await AssetItemModel.insertMany(docs);
      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  },
  update: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const payload = buildPayload(req.body);
      if (payload.location_id !== undefined) {
        throw createHttpError(400, 'Location changes must be handled via transfers');
      }
      const access = await resolveAccessContext(req.user);
      if (!access.isHeadofficeAdmin && !isOfficeManager(access.role)) {
        throw createHttpError(403, 'Not permitted to manage asset items');
      }
      const item = await AssetItemModel.findById(req.params.id);
      if (!item) return res.status(404).json({ message: 'Not found' });
      if (!access.isHeadofficeAdmin && item.location_id) {
        ensureOfficeScope(access, item.location_id.toString());
      }
      const updated = await AssetItemModel.findByIdAndUpdate(req.params.id, payload, { new: true });
      return res.json(updated);
    } catch (error) {
      next(error);
    }
  },
  remove: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      if (!access.isHeadofficeAdmin && !isOfficeManager(access.role)) {
        throw createHttpError(403, 'Not permitted to retire asset items');
      }
      const item = await AssetItemModel.findById(req.params.id);
      if (!item) return res.status(404).json({ message: 'Not found' });
      if (!access.isHeadofficeAdmin && item.location_id) {
        ensureOfficeScope(access, item.location_id.toString());
      }
      item.is_active = false;
      item.assignment_status = 'Unassigned';
      item.item_status = 'Retired';
      await item.save();
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
