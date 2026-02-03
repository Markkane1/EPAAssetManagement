import mongoose from 'mongoose';
import { Response, NextFunction } from 'express';
import { TransferModel } from '../models/transfer.model';
import { AssetItemModel } from '../models/assetItem.model';
import { OfficeModel } from '../models/office.model';
import type { AuthRequest } from '../middleware/auth';
import { resolveAccessContext, ensureOfficeScope, isOfficeManager } from '../utils/accessControl';
import { createHttpError } from '../utils/httpError';
import { createRecord, updateRecordStatus } from '../modules/records/services/record.service';
import { logAudit } from '../modules/records/services/audit.service';
import { RecordModel } from '../models/record.model';

const STATUS_FLOW: Record<string, string[]> = {
  REQUESTED: ['APPROVED'],
  APPROVED: ['DISPATCHED'],
  DISPATCHED: ['RECEIVED'],
  RECEIVED: [],
};

function readId(body: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    if (body[key]) return body[key];
  }
  return undefined;
}

function buildPayload(body: Record<string, unknown>) {
  const payload: Record<string, unknown> = {};
  payload.asset_item_id = readId(body as Record<string, any>, [
    'assetItemId',
    'asset_item_id',
  ]);
  payload.from_office_id = readId(body as Record<string, any>, [
    'fromOfficeId',
    'fromLocationId',
    'from_office_id',
    'from_location_id',
  ]);
  payload.to_office_id = readId(body as Record<string, any>, [
    'toOfficeId',
    'toLocationId',
    'to_office_id',
    'to_location_id',
  ]);
  payload.transfer_date = readId(body as Record<string, any>, [
    'transferDate',
    'transfer_date',
  ]);
  if ((body as Record<string, any>).handledBy !== undefined) payload.handled_by = (body as Record<string, any>).handledBy;
  if ((body as Record<string, any>).status !== undefined) payload.status = (body as Record<string, any>).status;
  if ((body as Record<string, any>).notes !== undefined) payload.notes = (body as Record<string, any>).notes;
  return payload;
}

async function ensureOfficeExists(officeId: string) {
  const office = await OfficeModel.findById(officeId);
  if (!office) throw createHttpError(404, 'Office not found');
  return office;
}

export const transferController = {
  list: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      const filter: Record<string, unknown> = { is_active: { $ne: false } };
      if (!access.isHeadofficeAdmin) {
        if (!access.officeId) throw createHttpError(403, 'User is not assigned to an office');
        filter.$or = [
          { from_office_id: access.officeId },
          { to_office_id: access.officeId },
        ];
      }
      const transfers = await TransferModel.find(filter).sort({ transfer_date: -1 });
      res.json(transfers);
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const transfer = await TransferModel.findById(req.params.id);
      if (!transfer) return res.status(404).json({ message: 'Not found' });

      const access = await resolveAccessContext(req.user);
      if (!access.isHeadofficeAdmin) {
        if (!transfer.from_office_id || !transfer.to_office_id) {
          throw createHttpError(403, 'Access restricted to assigned office');
        }
        const fromId = transfer.from_office_id.toString();
        const toId = transfer.to_office_id.toString();
        if (access.officeId !== fromId && access.officeId !== toId) {
          throw createHttpError(403, 'Access restricted to assigned office');
        }
      }

      return res.json(transfer);
    } catch (error) {
      next(error);
    }
  },
  getByAssetItem: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      const filter: Record<string, unknown> = {
        asset_item_id: req.params.assetItemId,
        is_active: { $ne: false },
      };
      if (!access.isHeadofficeAdmin) {
        if (!access.officeId) throw createHttpError(403, 'User is not assigned to an office');
        filter.$or = [
          { from_office_id: access.officeId },
          { to_office_id: access.officeId },
        ];
      }
      const transfers = await TransferModel.find(filter).sort({ transfer_date: -1 });
      res.json(transfers);
    } catch (error) {
      next(error);
    }
  },
  getByOffice: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      if (!access.isHeadofficeAdmin) {
        ensureOfficeScope(access, req.params.officeId);
      }
      const transfers = await TransferModel.find({
        is_active: { $ne: false },
        $or: [
          { from_office_id: req.params.officeId },
          { to_office_id: req.params.officeId },
        ],
      }).sort({ transfer_date: -1 });
      res.json(transfers);
    } catch (error) {
      next(error);
    }
  },
  create: async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    try {
      const access = await resolveAccessContext(req.user);
      if (!access.isHeadofficeAdmin && !isOfficeManager(access.role)) {
        throw createHttpError(403, 'Not permitted to create transfers');
      }

      const payload = buildPayload(req.body);
      const useWorkflow = Boolean((req.body as any).useWorkflow || (req.body as any).workflow || (req.body as any).status);
      if (!payload.asset_item_id || !payload.from_office_id || !payload.to_office_id) {
        throw createHttpError(400, 'Asset item, from office, and to office are required');
      }
      const assetItemId = String(payload.asset_item_id);
      const fromOfficeId = String(payload.from_office_id);
      const toOfficeId = String(payload.to_office_id);
      if (fromOfficeId === toOfficeId) {
        throw createHttpError(400, 'From and to offices must be different');
      }

      if (!access.isHeadofficeAdmin) {
        if (!access.officeId) throw createHttpError(403, 'User is not assigned to an office');
        const officeId = access.officeId;
        if (officeId !== fromOfficeId && officeId !== toOfficeId) {
          throw createHttpError(403, 'Transfers must originate from or arrive at your office');
        }
      }

      const assetItem = await AssetItemModel.findById(assetItemId);
      if (!assetItem) throw createHttpError(404, 'Asset item not found');
      if (assetItem.is_active === false) {
        throw createHttpError(400, 'Cannot transfer an inactive asset item');
      }
      if (assetItem.assignment_status === 'Assigned') {
        throw createHttpError(400, 'Assigned assets cannot be transferred');
      }
      if (!assetItem.location_id || assetItem.location_id.toString() !== fromOfficeId) {
        throw createHttpError(400, 'Asset item is not located at the from-office');
      }

      await ensureOfficeExists(fromOfficeId);
      await ensureOfficeExists(toOfficeId);

      await session.withTransaction(async () => {
        const initialStatus = (payload.status as string) || (useWorkflow ? 'REQUESTED' : 'DISPATCHED');
        const transfer = await TransferModel.create(
          [
            {
              ...payload,
              asset_item_id: assetItemId,
              from_office_id: fromOfficeId,
              to_office_id: toOfficeId,
              transfer_date: payload.transfer_date ? new Date(String(payload.transfer_date)) : new Date(),
              handled_by: access.userId,
              status: initialStatus,
              requested_by_user_id: access.userId,
              requested_at: new Date(),
              is_active: true,
              dispatched_by_user_id: !useWorkflow ? access.userId : null,
              dispatched_at: !useWorkflow ? new Date() : null,
            },
          ],
          { session }
        );

        if (!useWorkflow) {
          await AssetItemModel.findByIdAndUpdate(
            assetItemId,
            {
              location_id: toOfficeId,
              assignment_status: 'InTransit',
              item_status: 'InTransit',
            },
            { session }
          );
        }

        const recordStatus = access.isHeadofficeAdmin ? 'Approved' : 'PendingApproval';
        await createRecord(
          {
            userId: access.userId,
            role: access.role,
            locationId: access.officeId,
            isHeadoffice: access.isHeadofficeAdmin,
          },
          {
            recordType: 'TRANSFER',
            officeId: fromOfficeId,
            status: recordStatus,
            assetItemId: assetItemId,
            transferId: transfer[0].id,
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
          action: 'TRANSFER_CREATE',
          entityType: 'Transfer',
          entityId: transfer[0].id,
          officeId: fromOfficeId,
          diff: { status: initialStatus },
          session,
        });

        res.status(201).json(transfer[0]);
      });
    } catch (error) {
      next(error);
    } finally {
      session.endSession();
    }
  },
  updateStatus: async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    try {
      const access = await resolveAccessContext(req.user);
      if (!access.isHeadofficeAdmin && !isOfficeManager(access.role)) {
        throw createHttpError(403, 'Not permitted to update transfers');
      }
      const { status } = req.body as { status?: string };
      if (!status) throw createHttpError(400, 'Status is required');

      const transfer = await TransferModel.findById(req.params.id);
      if (!transfer) return res.status(404).json({ message: 'Not found' });

      if (!access.isHeadofficeAdmin) {
        const fromId = transfer.from_office_id?.toString();
        const toId = transfer.to_office_id?.toString();
        if (access.officeId !== fromId && access.officeId !== toId) {
          throw createHttpError(403, 'Transfers must belong to your office');
        }
      }

      const allowedNext = STATUS_FLOW[transfer.status] || [];
      if (!allowedNext.includes(status)) {
        throw createHttpError(400, `Invalid status transition from ${transfer.status} to ${status}`);
      }

      const assetItem = await AssetItemModel.findById(transfer.asset_item_id);
      if (!assetItem) throw createHttpError(404, 'Asset item not found');
      if ((status === 'DISPATCHED' || status === 'RECEIVED') && assetItem.assignment_status === 'Assigned') {
        throw createHttpError(400, 'Assigned assets cannot be dispatched or received');
      }

      const previousStatus = transfer.status;
      await session.withTransaction(async () => {
        transfer.status = status;
        transfer.handled_by = access.userId;
        if (status === 'APPROVED') {
          transfer.approved_by_user_id = access.userId;
          transfer.approved_at = new Date();
        }
        if (status === 'DISPATCHED') {
          transfer.dispatched_by_user_id = access.userId;
          transfer.dispatched_at = new Date();
        }
        if (status === 'RECEIVED') {
          transfer.received_by_user_id = access.userId;
          transfer.received_at = new Date();
        }
        await transfer.save({ session });

        if (status === 'DISPATCHED') {
          await AssetItemModel.findByIdAndUpdate(
            assetItem.id,
            { item_status: 'InTransit', assignment_status: 'InTransit' },
            { session }
          );
        }

        if (status === 'RECEIVED') {
          await AssetItemModel.findByIdAndUpdate(
            assetItem.id,
            {
              location_id: transfer.to_office_id,
              item_status: assetItem.item_status === 'Maintenance' ? 'Maintenance' : 'Available',
              assignment_status: 'Unassigned',
            },
            { session }
          );

          const linkedRecord = await RecordModel.findOne({
            record_type: 'TRANSFER',
            transfer_id: transfer.id,
          }).session(session);
          if (linkedRecord) {
            try {
              await updateRecordStatus(
                {
                  userId: access.userId,
                  role: access.role,
                  locationId: access.officeId,
                  isHeadoffice: access.isHeadofficeAdmin,
                },
                linkedRecord.id,
                'Completed',
                transfer.notes || undefined,
                session
              );
            } catch {
              // Leave record status unchanged if requirements are not met
            }
          }
        }
      });

      await logAudit({
        ctx: {
          userId: access.userId,
          role: access.role,
          locationId: access.officeId,
          isHeadoffice: access.isHeadofficeAdmin,
        },
        action: 'TRANSFER_STATUS_CHANGE',
        entityType: 'Transfer',
        entityId: transfer.id,
        officeId: transfer.from_office_id?.toString() || access.officeId || '',
        diff: { from: previousStatus, to: status },
      });

      res.json(transfer);
    } catch (error) {
      next(error);
    } finally {
      session.endSession();
    }
  },
  remove: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      if (!access.isHeadofficeAdmin) {
        throw createHttpError(403, 'Only Head Office Admin can retire transfers');
      }
      const transfer = await TransferModel.findById(req.params.id);
      if (!transfer) return res.status(404).json({ message: 'Not found' });
      transfer.is_active = false;
      await transfer.save();
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
