import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { MaintenanceRecordModel } from '../models/maintenanceRecord.model';
import { AssetItemModel } from '../models/assetItem.model';
import { mapFields } from '../utils/mapFields';
import type { AuthRequest } from '../middleware/auth';
import { resolveAccessContext, ensureOfficeScope, isOfficeManager } from '../utils/accessControl';
import { createHttpError } from '../utils/httpError';
import { createRecord, updateRecordStatus } from '../modules/records/services/record.service';
import { RecordModel } from '../models/record.model';
import { logAudit } from '../modules/records/services/audit.service';

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
  if (payload.scheduled_date) payload.scheduled_date = new Date(String(payload.scheduled_date));
  if (payload.completed_date) payload.completed_date = new Date(String(payload.completed_date));
  return payload;
}

export const maintenanceController = {
  list: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      if (access.isHeadofficeAdmin) {
        const records = await MaintenanceRecordModel.find({ is_active: { $ne: false } }).sort({ created_at: -1 });
        return res.json(records);
      }
      if (!access.officeId) throw createHttpError(403, 'User is not assigned to an office');
      const assetItemIds = await AssetItemModel.distinct('_id', {
        location_id: access.officeId,
        is_active: { $ne: false },
      });
      const records = await MaintenanceRecordModel.find({
        asset_item_id: { $in: assetItemIds },
        is_active: { $ne: false },
      }).sort({ created_at: -1 });
      res.json(records);
    } catch (error) {
      next(error);
    }
  },
  getScheduled: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      const filter: Record<string, unknown> = {
        maintenance_status: 'Scheduled',
        is_active: { $ne: false },
      };
      if (!access.isHeadofficeAdmin) {
        if (!access.officeId) throw createHttpError(403, 'User is not assigned to an office');
        const assetItemIds = await AssetItemModel.distinct('_id', {
          location_id: access.officeId,
          is_active: { $ne: false },
        });
        filter.asset_item_id = { $in: assetItemIds };
      }
      const records = await MaintenanceRecordModel.find(filter).sort({ created_at: -1 });
      res.json(records);
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const record = await MaintenanceRecordModel.findById(req.params.id);
      if (!record) return res.status(404).json({ message: 'Not found' });
      const access = await resolveAccessContext(req.user);
      if (!access.isHeadofficeAdmin) {
        const item = await AssetItemModel.findById(record.asset_item_id);
        if (!item?.location_id) throw createHttpError(403, 'Access restricted to assigned office');
        ensureOfficeScope(access, item.location_id.toString());
      }
      return res.json(record);
    } catch (error) {
      next(error);
    }
  },
  getByAssetItem: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      if (!access.isHeadofficeAdmin) {
        const item = await AssetItemModel.findById(req.params.assetItemId);
        if (!item?.location_id) throw createHttpError(403, 'Access restricted to assigned office');
        ensureOfficeScope(access, item.location_id.toString());
      }
      const records = await MaintenanceRecordModel.find({
        asset_item_id: req.params.assetItemId,
        is_active: { $ne: false },
      }).sort({ created_at: -1 });
      res.json(records);
    } catch (error) {
      next(error);
    }
  },
  create: async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    try {
      const access = await resolveAccessContext(req.user);
      if (!access.isHeadofficeAdmin && !isOfficeManager(access.role)) {
        throw createHttpError(403, 'Not permitted to create maintenance records');
      }
      const payload = buildPayload(req.body);
      if (!payload.maintenance_type) payload.maintenance_type = 'Preventive';
      if (!payload.maintenance_status) payload.maintenance_status = 'Scheduled';
      if (!payload.asset_item_id) throw createHttpError(400, 'Asset item is required');

      const assetItem = await AssetItemModel.findById(payload.asset_item_id);
      if (!assetItem) throw createHttpError(404, 'Asset item not found');
      if (assetItem.is_active === false) {
        throw createHttpError(400, 'Cannot create maintenance for an inactive asset item');
      }
      if (!access.isHeadofficeAdmin && assetItem.location_id) {
        ensureOfficeScope(access, assetItem.location_id.toString());
      }

      await session.withTransaction(async () => {
        const record = await MaintenanceRecordModel.create([payload], { session });
        await AssetItemModel.findByIdAndUpdate(
          payload.asset_item_id,
          { item_status: 'Maintenance' },
          { session }
        );

        await createRecord(
          {
            userId: access.userId,
            role: access.role,
            locationId: access.officeId,
            isHeadoffice: access.isHeadofficeAdmin,
          },
          {
            recordType: 'MAINTENANCE',
            officeId: assetItem.location_id?.toString(),
            status: 'Approved',
            assetItemId: payload.asset_item_id as string,
            maintenanceRecordId: record[0].id,
            notes: payload.notes as string | undefined,
          },
          session
        );

        await logAudit({
          ctx: {
            userId: access.userId,
            role: access.role,
            locationId: access.officeId,
            isHeadoffice: access.isHeadofficeAdmin,
          },
          action: 'MAINTENANCE_CREATE',
          entityType: 'MaintenanceRecord',
          entityId: record[0].id,
          officeId: assetItem.location_id?.toString() || access.officeId || '',
          diff: { maintenanceStatus: record[0].maintenance_status },
          session,
        });

        res.status(201).json(record[0]);
      });
    } catch (error) {
      next(error);
    } finally {
      session.endSession();
    }
  },
  update: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      if (!access.isHeadofficeAdmin && !isOfficeManager(access.role)) {
        throw createHttpError(403, 'Not permitted to update maintenance records');
      }
      const payload = buildPayload(req.body);
      const record = await MaintenanceRecordModel.findByIdAndUpdate(req.params.id, payload, { new: true });
      if (!record) return res.status(404).json({ message: 'Not found' });
      return res.json(record);
    } catch (error) {
      next(error);
    }
  },
  complete: async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    try {
      const access = await resolveAccessContext(req.user);
      if (!access.isHeadofficeAdmin && !isOfficeManager(access.role)) {
        throw createHttpError(403, 'Not permitted to complete maintenance');
      }
      const { completedDate } = req.body as { completedDate?: string };
      const record = await MaintenanceRecordModel.findById(req.params.id);
      if (!record) return res.status(404).json({ message: 'Not found' });
      const assetItem = await AssetItemModel.findById(record.asset_item_id);
      if (!assetItem) throw createHttpError(404, 'Asset item not found');
      if (!access.isHeadofficeAdmin && assetItem.location_id) {
        ensureOfficeScope(access, assetItem.location_id.toString());
      }

      await session.withTransaction(async () => {
        record.maintenance_status = 'Completed';
        record.completed_date = completedDate ? new Date(completedDate) : new Date();
        await record.save({ session });

        const nextStatus = assetItem.assignment_status === 'Assigned' ? 'Assigned' : 'Available';
        await AssetItemModel.findByIdAndUpdate(
          record.asset_item_id,
          { item_status: nextStatus },
          { session }
        );

        const existingRecord = await RecordModel.findOne({
          record_type: 'MAINTENANCE',
          maintenance_record_id: record.id,
        }).session(session);

        if (existingRecord) {
          await updateRecordStatus(
            {
              userId: access.userId,
              role: access.role,
              locationId: access.officeId,
              isHeadoffice: access.isHeadofficeAdmin,
            },
            existingRecord.id,
            'Completed',
            record.notes || undefined,
            session
          );
        } else {
          await createRecord(
            {
              userId: access.userId,
              role: access.role,
              locationId: access.officeId,
              isHeadoffice: access.isHeadofficeAdmin,
            },
            {
              recordType: 'MAINTENANCE',
              officeId: assetItem.location_id?.toString(),
              status: 'Completed',
              assetItemId: record.asset_item_id.toString(),
              maintenanceRecordId: record.id,
              notes: record.notes || undefined,
            },
            session
          );
        }

        await logAudit({
          ctx: {
            userId: access.userId,
            role: access.role,
            locationId: access.officeId,
            isHeadoffice: access.isHeadofficeAdmin,
          },
          action: 'MAINTENANCE_COMPLETE',
          entityType: 'MaintenanceRecord',
          entityId: record.id,
          officeId: assetItem.location_id?.toString() || access.officeId || '',
          diff: { completedDate: record.completed_date },
          session,
        });
      });

      res.json(record);
    } catch (error) {
      next(error);
    } finally {
      session.endSession();
    }
  },
  remove: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      if (!access.isHeadofficeAdmin && !isOfficeManager(access.role)) {
        throw createHttpError(403, 'Not permitted to remove maintenance records');
      }
      const record = await MaintenanceRecordModel.findById(req.params.id);
      if (!record) return res.status(404).json({ message: 'Not found' });
      record.is_active = false;
      await record.save();
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
