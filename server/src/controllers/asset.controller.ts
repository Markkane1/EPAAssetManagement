import { Response, NextFunction } from 'express';
import { AssetModel } from '../models/asset.model';
import { AssetItemModel } from '../models/assetItem.model';
import { mapFields } from '../utils/mapFields';
import { resolveAccessContext } from '../utils/accessControl';
import { createHttpError } from '../utils/httpError';
import type { AuthRequest } from '../middleware/auth';

const fieldMap = {
  categoryId: 'category_id',
  vendorId: 'vendor_id',
  purchaseOrderId: 'purchase_order_id',
  projectId: 'project_id',
  acquisitionDate: 'acquisition_date',
  unitPrice: 'unit_price',
  price: 'unit_price',
  assetSource: 'asset_source',
  schemeId: 'scheme_id',
  isActive: 'is_active',
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

  if (body.name !== undefined) payload.name = body.name;
  if (body.description !== undefined) payload.description = body.description;
  if (body.currency !== undefined) payload.currency = body.currency;
  if (body.quantity !== undefined) payload.quantity = body.quantity;
  if (payload.acquisition_date) {
    payload.acquisition_date = new Date(String(payload.acquisition_date));
  }
  if (payload.vendor_id === "") payload.vendor_id = null;
  if (payload.project_id === "") payload.project_id = null;
  if (payload.scheme_id === "") payload.scheme_id = null;

  return payload;
}

export const assetController = {
  list: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { limit, skip } = readPagination(req.query as Record<string, unknown>);
      const access = await resolveAccessContext(req.user);
      if (access.isHeadofficeAdmin) {
        const assets = await AssetModel.find({ is_active: { $ne: false } })
          .sort({ name: 1 })
          .skip(skip)
          .limit(limit)
          .lean();
        return res.json(assets);
      }
      if (!access.officeId) throw createHttpError(403, 'User is not assigned to an office');
      const assetIds = await AssetItemModel.distinct('asset_id', {
        location_id: access.officeId,
        is_active: { $ne: false },
      });
      const assets = await AssetModel.find({ _id: { $in: assetIds }, is_active: { $ne: false } })
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean();
      res.json(assets);
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      const asset = await AssetModel.findById(req.params.id).lean();
      if (!asset) return res.status(404).json({ message: 'Not found' });
      if (!access.isHeadofficeAdmin) {
        if (!access.officeId) throw createHttpError(403, 'User is not assigned to an office');
        const hasItem = await AssetItemModel.exists({
          asset_id: asset._id,
          location_id: access.officeId,
          is_active: { $ne: false },
        });
        if (!hasItem) throw createHttpError(403, 'Access restricted to assigned office inventory');
      }
      return res.json(asset);
    } catch (error) {
      next(error);
    }
  },
  getByCategory: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { limit, skip } = readPagination(req.query as Record<string, unknown>);
      const access = await resolveAccessContext(req.user);
      if (access.isHeadofficeAdmin) {
        const assets = await AssetModel.find({ category_id: req.params.categoryId, is_active: { $ne: false } })
          .sort({ name: 1 })
          .skip(skip)
          .limit(limit)
          .lean();
        return res.json(assets);
      }
      if (!access.officeId) throw createHttpError(403, 'User is not assigned to an office');
      const assetIds = await AssetItemModel.distinct('asset_id', {
        location_id: access.officeId,
        is_active: { $ne: false },
      });
      const assets = await AssetModel.find({
        _id: { $in: assetIds },
        category_id: req.params.categoryId,
        is_active: { $ne: false },
      })
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean();
      res.json(assets);
    } catch (error) {
      next(error);
    }
  },
  getByVendor: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { limit, skip } = readPagination(req.query as Record<string, unknown>);
      const access = await resolveAccessContext(req.user);
      if (access.isHeadofficeAdmin) {
        const assets = await AssetModel.find({ vendor_id: req.params.vendorId, is_active: { $ne: false } })
          .sort({ name: 1 })
          .skip(skip)
          .limit(limit)
          .lean();
        return res.json(assets);
      }
      if (!access.officeId) throw createHttpError(403, 'User is not assigned to an office');
      const assetIds = await AssetItemModel.distinct('asset_id', {
        location_id: access.officeId,
        is_active: { $ne: false },
      });
      const assets = await AssetModel.find({
        _id: { $in: assetIds },
        vendor_id: req.params.vendorId,
        is_active: { $ne: false },
      })
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean();
      res.json(assets);
    } catch (error) {
      next(error);
    }
  },
  create: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      if (!access.isHeadofficeAdmin) {
        throw createHttpError(403, 'Only Head Office Admin can create asset definitions');
      }
      const payload = buildPayload(req.body);
      if (payload.currency === undefined) payload.currency = 'PKR';
      if (payload.quantity === undefined) payload.quantity = 1;
      const asset = await AssetModel.create(payload);
      res.status(201).json(asset);
    } catch (error) {
      next(error);
    }
  },
  update: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      if (!access.isHeadofficeAdmin) {
        throw createHttpError(403, 'Only Head Office Admin can update asset definitions');
      }
      const payload = buildPayload(req.body);
      const asset = await AssetModel.findByIdAndUpdate(req.params.id, payload, { new: true });
      if (!asset) return res.status(404).json({ message: 'Not found' });
      return res.json(asset);
    } catch (error) {
      next(error);
    }
  },
  remove: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      if (!access.isHeadofficeAdmin) {
        throw createHttpError(403, 'Only Head Office Admin can retire assets');
      }
      const asset = await AssetModel.findById(req.params.id);
      if (!asset) return res.status(404).json({ message: 'Not found' });
      asset.is_active = false;
      await asset.save();
      await AssetItemModel.updateMany(
        { asset_id: req.params.id },
        { is_active: false, item_status: 'Retired', assignment_status: 'Unassigned' }
      );
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
