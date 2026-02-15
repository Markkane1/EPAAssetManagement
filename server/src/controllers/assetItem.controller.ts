import { Response, NextFunction } from 'express';
import { AssetItemModel } from '../models/assetItem.model';
import { AssetModel } from '../models/asset.model';
import { OfficeModel } from '../models/office.model';
import { StoreModel } from '../models/store.model';
import { mapFields } from '../utils/mapFields';
import type { AuthRequest } from '../middleware/auth';
import { resolveAccessContext, ensureOfficeScope, isOfficeManager } from '../utils/accessControl';
import { createHttpError } from '../utils/httpError';
import { enforceAssetCategoryScopeForOffice } from '../utils/categoryScope';
import {
  getAssetItemOfficeId,
  officeAssetItemFilter,
} from '../utils/assetHolder';

const fieldMap = {
  assetId: 'asset_id',
  locationId: 'location_id',
  holderType: 'holder_type',
  holderId: 'holder_id',
  serialNumber: 'serial_number',
  assignmentStatus: 'assignment_status',
  itemStatus: 'item_status',
  itemCondition: 'item_condition',
  condition: 'item_condition',
  functionalStatus: 'functional_status',
  itemSource: 'item_source',
  purchaseDate: 'purchase_date',
  warrantyExpiry: 'warranty_expiry',
  isActive: 'is_active',
};

const MANAGER_ALLOWED_UPDATE_FIELDS = new Set(['item_status', 'item_condition', 'notes']);

function clampInt(value: unknown, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.floor(parsed), max));
}

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

async function resolveDefaultHolder() {
  const systemStore = await StoreModel.findOne({
    code: 'HEAD_OFFICE_STORE',
    is_active: { $ne: false },
  });
  if (systemStore) {
    return { holder_type: 'STORE' as const, holder_id: systemStore.id };
  }
  return null;
}

async function resolveRequestedHolder(
  payload: Record<string, unknown>
): Promise<{ holder_type: 'OFFICE' | 'STORE'; holder_id: string }> {
  const requestedHolderType = payload.holder_type ? String(payload.holder_type).toUpperCase() : null;
  const requestedHolderId = payload.holder_id ? String(payload.holder_id) : null;
  const requestedLocationId = payload.location_id ? String(payload.location_id) : null;

  if (requestedLocationId && (requestedHolderType || requestedHolderId)) {
    throw createHttpError(400, 'Use either location_id or holder_type/holder_id');
  }

  if (requestedLocationId) {
    return {
      holder_type: 'OFFICE' as const,
      holder_id: requestedLocationId,
    };
  }

  if (requestedHolderType || requestedHolderId) {
    if (!requestedHolderType || !requestedHolderId) {
      throw createHttpError(400, 'holder_type and holder_id are required together');
    }
    if (requestedHolderType !== 'OFFICE' && requestedHolderType !== 'STORE') {
      throw createHttpError(400, 'holder_type must be OFFICE or STORE');
    }
    return {
      holder_type: requestedHolderType as 'OFFICE' | 'STORE',
      holder_id: requestedHolderId,
    };
  }

  const fallback = await resolveDefaultHolder();
  if (!fallback) {
    throw createHttpError(400, 'Head Office Store must be configured before creating items');
  }
  return fallback;
}

async function validateHolderAndCategory(assetId: string, holder: { holder_type: 'OFFICE' | 'STORE'; holder_id: string }) {
  if (holder.holder_type === 'OFFICE') {
    const locationExists = await OfficeModel.exists({ _id: holder.holder_id });
    if (!locationExists) throw createHttpError(404, 'Office not found');
    await enforceAssetCategoryScopeForOffice(String(assetId), holder.holder_id);
    return;
  }

  const storeExists = await StoreModel.exists({ _id: holder.holder_id, is_active: { $ne: false } });
  if (!storeExists) throw createHttpError(404, 'Store not found');
}

export const assetItemController = {
  list: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const limit = clampInt(req.query.limit, 250, 1000);
      const page = clampInt(req.query.page, 1, 10_000);
      const access = await resolveAccessContext(req.user);
      const filter: Record<string, unknown> = { is_active: { $ne: false } };
      if (!access.isHeadofficeAdmin) {
        if (!access.officeId) throw createHttpError(403, 'User is not assigned to an office');
        Object.assign(filter, officeAssetItemFilter(access.officeId));
      }
      const items = await AssetItemModel.find(filter)
        .sort({ created_at: -1 })
        .skip((page - 1) * limit)
        .limit(limit);
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
        const officeId = getAssetItemOfficeId(item);
        if (!officeId) throw createHttpError(403, 'Asset item is not assigned to an office');
        ensureOfficeScope(access, officeId);
      }
      return res.json(item);
    } catch (error) {
      next(error);
    }
  },
  getByAsset: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const limit = clampInt(req.query.limit, 250, 1000);
      const page = clampInt(req.query.page, 1, 10_000);
      const access = await resolveAccessContext(req.user);
      const filter: Record<string, unknown> = { asset_id: req.params.assetId, is_active: { $ne: false } };
      if (!access.isHeadofficeAdmin) {
        if (!access.officeId) throw createHttpError(403, 'User is not assigned to an office');
        Object.assign(filter, officeAssetItemFilter(access.officeId));
      }
      const items = await AssetItemModel.find(filter)
        .sort({ created_at: -1 })
        .skip((page - 1) * limit)
        .limit(limit);
      res.json(items);
    } catch (error) {
      next(error);
    }
  },
  getByLocation: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const limit = clampInt(req.query.limit, 250, 1000);
      const page = clampInt(req.query.page, 1, 10_000);
      const access = await resolveAccessContext(req.user);
      const locationId = String(req.params.locationId || "");
      if (!access.isHeadofficeAdmin) {
        ensureOfficeScope(access, locationId);
      }
      const items = await AssetItemModel.find({
        ...officeAssetItemFilter(locationId),
        is_active: { $ne: false },
      })
        .sort({ created_at: -1 })
        .skip((page - 1) * limit)
        .limit(limit);
      res.json(items);
    } catch (error) {
      next(error);
    }
  },
  getAvailable: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const limit = clampInt(req.query.limit, 250, 1000);
      const page = clampInt(req.query.page, 1, 10_000);
      const access = await resolveAccessContext(req.user);
      const filter: Record<string, unknown> = {
        item_status: 'Available',
        assignment_status: 'Unassigned',
        is_active: { $ne: false },
      };
      if (!access.isHeadofficeAdmin) {
        if (!access.officeId) throw createHttpError(403, 'User is not assigned to an office');
        Object.assign(filter, officeAssetItemFilter(access.officeId));
      }
      const items = await AssetItemModel.find(filter)
        .sort({ created_at: -1 })
        .skip((page - 1) * limit)
        .limit(limit);
      res.json(items);
    } catch (error) {
      next(error);
    }
  },
  create: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      if (!access.isHeadofficeAdmin) {
        throw createHttpError(403, 'Only org_admin can create asset items');
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

      const holder = await resolveRequestedHolder(payload);
      await validateHolderAndCategory(String(payload.asset_id), holder);
      payload.holder_type = holder.holder_type;
      payload.holder_id = holder.holder_id;
      delete payload.location_id;

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
        throw createHttpError(403, 'Only org_admin can create asset items');
      }
      const {
        assetId,
        locationId,
        holderType,
        holderId,
        itemStatus,
        itemCondition,
        functionalStatus,
        notes,
        items,
      } = req.body as {
        assetId: string;
        locationId?: string;
        holderType?: 'OFFICE' | 'STORE';
        holderId?: string;
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

      const holderPayload: Record<string, unknown> = {};
      if (locationId) holderPayload.location_id = locationId;
      if (holderType) holderPayload.holder_type = holderType;
      if (holderId) holderPayload.holder_id = holderId;
      const holder = await resolveRequestedHolder(holderPayload);
      await validateHolderAndCategory(assetId, holder);

      const docs = items.map((item, index) => ({
        asset_id: assetId,
        holder_type: holder.holder_type,
        holder_id: holder.holder_id,
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
      const access = await resolveAccessContext(req.user);
      if (!access.isHeadofficeAdmin && !isOfficeManager(access.role)) {
        throw createHttpError(403, 'Not permitted to manage asset items');
      }

      const payload = buildPayload(req.body);
      const payloadKeys = Object.keys(payload);
      if (!access.isHeadofficeAdmin) {
        const forbiddenFields = payloadKeys.filter((field) => !MANAGER_ALLOWED_UPDATE_FIELDS.has(field));
        if (forbiddenFields.length > 0) {
          throw createHttpError(
            403,
            `Forbidden field edit for role ${access.role}: ${forbiddenFields.sort().join(', ')}`
          );
        }
      }
      if (payload.location_id !== undefined || payload.holder_type !== undefined || payload.holder_id !== undefined) {
        throw createHttpError(400, 'Holder changes must be handled via transfers');
      }
      const item = await AssetItemModel.findById(req.params.id);
      if (!item) return res.status(404).json({ message: 'Not found' });
      const officeId = getAssetItemOfficeId(item);
      if (!access.isHeadofficeAdmin && officeId) {
        ensureOfficeScope(access, officeId);
      }
      const targetAssetId = String(payload.asset_id || item.asset_id || '');
      const targetOfficeId = getAssetItemOfficeId(item);
      if (targetAssetId && targetOfficeId) {
        await enforceAssetCategoryScopeForOffice(targetAssetId, targetOfficeId);
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
      if (!access.isHeadofficeAdmin) {
        throw createHttpError(403, 'Only org_admin can retire asset items');
      }
      const item = await AssetItemModel.findById(req.params.id);
      if (!item) return res.status(404).json({ message: 'Not found' });
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
