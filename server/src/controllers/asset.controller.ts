import { Request, Response, NextFunction } from 'express';
import { AssetModel } from '../models/asset.model';
import { mapFields } from '../utils/mapFields';

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
  if (payload.vendor_id === "") payload.vendor_id = null;
  if (payload.project_id === "") payload.project_id = null;
  if (payload.scheme_id === "") payload.scheme_id = null;

  return payload;
}

export const assetController = {
  list: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const assets = await AssetModel.find().sort({ name: 1 });
      res.json(assets);
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const asset = await AssetModel.findById(req.params.id);
      if (!asset) return res.status(404).json({ message: 'Not found' });
      return res.json(asset);
    } catch (error) {
      next(error);
    }
  },
  getByCategory: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const assets = await AssetModel.find({ category_id: req.params.categoryId }).sort({ name: 1 });
      res.json(assets);
    } catch (error) {
      next(error);
    }
  },
  getByVendor: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const assets = await AssetModel.find({ vendor_id: req.params.vendorId }).sort({ name: 1 });
      res.json(assets);
    } catch (error) {
      next(error);
    }
  },
  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = buildPayload(req.body);
      if (payload.currency === undefined) payload.currency = 'PKR';
      if (payload.quantity === undefined) payload.quantity = 1;
      const asset = await AssetModel.create(payload);
      res.status(201).json(asset);
    } catch (error) {
      next(error);
    }
  },
  update: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = buildPayload(req.body);
      const asset = await AssetModel.findByIdAndUpdate(req.params.id, payload, { new: true });
      if (!asset) return res.status(404).json({ message: 'Not found' });
      return res.json(asset);
    } catch (error) {
      next(error);
    }
  },
  remove: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const asset = await AssetModel.findByIdAndDelete(req.params.id);
      if (!asset) return res.status(404).json({ message: 'Not found' });
      await AssetItemModel.deleteMany({ asset_id: req.params.id });
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
