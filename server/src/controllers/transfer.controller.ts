import { Request, Response, NextFunction } from 'express';
import { TransferHistoryModel } from '../models/transferHistory.model';
import { AssetItemModel } from '../models/assetItem.model';
import { mapFields } from '../utils/mapFields';

const fieldMap = {
  assetItemId: 'asset_item_id',
  fromLocationId: 'from_location_id',
  toLocationId: 'to_location_id',
  transferDate: 'transfer_date',
  performedBy: 'performed_by',
};

function buildPayload(body: Record<string, unknown>) {
  const payload = mapFields(body, fieldMap);
  Object.values(fieldMap).forEach((dbKey) => {
    if (body[dbKey] !== undefined) {
      payload[dbKey] = body[dbKey];
    }
  });
  if (body.reason !== undefined) payload.reason = body.reason;
  return payload;
}

export const transferController = {
  list: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const transfers = await TransferHistoryModel.find().sort({ transfer_date: -1 });
      res.json(transfers);
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const transfer = await TransferHistoryModel.findById(req.params.id);
      if (!transfer) return res.status(404).json({ message: 'Not found' });
      return res.json(transfer);
    } catch (error) {
      next(error);
    }
  },
  getByAssetItem: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const transfers = await TransferHistoryModel.find({ asset_item_id: req.params.assetItemId })
        .sort({ transfer_date: -1 });
      res.json(transfers);
    } catch (error) {
      next(error);
    }
  },
  getByLocation: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const transfers = await TransferHistoryModel.find({
        $or: [
          { from_location_id: req.params.locationId },
          { to_location_id: req.params.locationId },
        ],
      }).sort({ transfer_date: -1 });
      res.json(transfers);
    } catch (error) {
      next(error);
    }
  },
  getRecent: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = Number(req.query.limit || 5);
      const transfers = await TransferHistoryModel.find().sort({ transfer_date: -1 }).limit(limit);
      res.json(transfers);
    } catch (error) {
      next(error);
    }
  },
  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = buildPayload(req.body);
      const transfer = await TransferHistoryModel.create(payload);

      if (payload.asset_item_id) {
        await AssetItemModel.findByIdAndUpdate(payload.asset_item_id, {
          location_id: payload.to_location_id,
          assignment_status: 'InTransit',
        });
      }

      res.status(201).json(transfer);
    } catch (error) {
      next(error);
    }
  },
  remove: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const transfer = await TransferHistoryModel.findByIdAndDelete(req.params.id);
      if (!transfer) return res.status(404).json({ message: 'Not found' });
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
