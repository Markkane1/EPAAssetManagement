import { Request, Response, NextFunction } from 'express';
import { MaintenanceRecordModel } from '../models/maintenanceRecord.model';
import { AssetItemModel } from '../models/assetItem.model';
import { mapFields } from '../utils/mapFields';

const fieldMap = {
  assetItemId: 'asset_item_id',
  maintenanceType: 'maintenance_type',
  maintenanceStatus: 'maintenance_status',
  performedBy: 'performed_by',
  scheduledDate: 'scheduled_date',
  completedDate: 'completed_date',
};

function buildPayload(body: Record<string, unknown>) {
  const payload = mapFields(body, fieldMap);
  Object.values(fieldMap).forEach((dbKey) => {
    if (body[dbKey] !== undefined) {
      payload[dbKey] = body[dbKey];
    }
  });
  if (body.description !== undefined) payload.description = body.description;
  if (body.cost !== undefined) payload.cost = body.cost;
  if (body.notes !== undefined) payload.notes = body.notes;
  return payload;
}

export const maintenanceController = {
  list: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const records = await MaintenanceRecordModel.find().sort({ created_at: -1 });
      res.json(records);
    } catch (error) {
      next(error);
    }
  },
  getScheduled: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const records = await MaintenanceRecordModel.find({ maintenance_status: 'Scheduled' })
        .sort({ created_at: -1 });
      res.json(records);
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const record = await MaintenanceRecordModel.findById(req.params.id);
      if (!record) return res.status(404).json({ message: 'Not found' });
      return res.json(record);
    } catch (error) {
      next(error);
    }
  },
  getByAssetItem: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const records = await MaintenanceRecordModel.find({ asset_item_id: req.params.assetItemId })
        .sort({ created_at: -1 });
      res.json(records);
    } catch (error) {
      next(error);
    }
  },
  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = buildPayload(req.body);
      if (!payload.maintenance_type) payload.maintenance_type = 'Preventive';
      if (!payload.maintenance_status) payload.maintenance_status = 'Scheduled';
      const record = await MaintenanceRecordModel.create(payload);

      if (payload.asset_item_id) {
        await AssetItemModel.findByIdAndUpdate(payload.asset_item_id, {
          item_status: 'Maintenance',
        });
      }

      res.status(201).json(record);
    } catch (error) {
      next(error);
    }
  },
  update: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = buildPayload(req.body);
      const record = await MaintenanceRecordModel.findByIdAndUpdate(req.params.id, payload, { new: true });
      if (!record) return res.status(404).json({ message: 'Not found' });
      return res.json(record);
    } catch (error) {
      next(error);
    }
  },
  complete: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { completedDate } = req.body as { completedDate: string };
      const record = await MaintenanceRecordModel.findById(req.params.id);
      if (!record) return res.status(404).json({ message: 'Not found' });

      record.maintenance_status = 'Completed';
      record.completed_date = completedDate;
      await record.save();

      await AssetItemModel.findByIdAndUpdate(record.asset_item_id, {
        item_status: 'Available',
      });

      res.json(record);
    } catch (error) {
      next(error);
    }
  },
  remove: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const record = await MaintenanceRecordModel.findByIdAndDelete(req.params.id);
      if (!record) return res.status(404).json({ message: 'Not found' });
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
