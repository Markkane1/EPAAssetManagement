import mongoose from 'mongoose';
import { Response, NextFunction } from 'express';
import { TransferModel } from '../models/transfer.model';
import { AssetItemModel } from '../models/assetItem.model';
import { OfficeModel } from '../models/office.model';
import { StoreModel } from '../models/store.model';
import { DocumentModel } from '../models/document.model';
import type { AuthRequest } from '../middleware/auth';
import { resolveAccessContext, ensureOfficeScope, isOfficeManager } from '../utils/accessControl';
import { createHttpError } from '../utils/httpError';
import { createRecord, updateRecordStatus } from '../modules/records/services/record.service';
import { logAudit } from '../modules/records/services/audit.service';
import { RecordModel } from '../models/record.model';
import { enforceAssetCategoryScopeForOffice } from '../utils/categoryScope';
import {
  isAssetItemHeldByOffice,
  officeAssetItemFilter,
  setAssetItemOfficeHolderUpdate,
  setAssetItemStoreHolderUpdate,
} from '../utils/assetHolder';

const HEAD_OFFICE_STORE_CODE = 'HEAD_OFFICE_STORE';

const STATUS_FLOW: Record<string, string[]> = {
  REQUESTED: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['DISPATCHED_TO_STORE', 'REJECTED', 'CANCELLED'],
  DISPATCHED_TO_STORE: ['RECEIVED_AT_STORE', 'CANCELLED'],
  RECEIVED_AT_STORE: ['DISPATCHED_TO_DEST', 'CANCELLED'],
  DISPATCHED_TO_DEST: ['RECEIVED_AT_DEST', 'CANCELLED'],
  RECEIVED_AT_DEST: [],
  REJECTED: [],
  CANCELLED: [],
};

function readParam(req: AuthRequest, key: string) {
  const raw = (req.params as Record<string, string | string[] | undefined>)[key];
  if (Array.isArray(raw)) return String(raw[0] || '').trim();
  return String(raw || '').trim();
}

function clampInt(value: unknown, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.floor(parsed), max));
}

function readId(body: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    if (body[key]) return String(body[key]);
  }
  return null;
}

function parseLinePayload(linesRaw: unknown) {
  const lines = Array.isArray(linesRaw) ? linesRaw : [];
  const normalized: Array<{ asset_item_id: string; notes?: string | null }> = [];

  lines.forEach((line, index) => {
    if (!line || typeof line !== 'object') {
      throw createHttpError(400, `lines[${index}] is invalid`);
    }
    const row = line as Record<string, unknown>;
    const assetItemId = String(row.assetItemId || row.asset_item_id || '').trim();
    if (!assetItemId) {
      throw createHttpError(400, `lines[${index}].asset_item_id is required`);
    }
    normalized.push({
      asset_item_id: assetItemId,
      notes: row.notes === undefined ? null : String(row.notes || ''),
    });
  });

  if (normalized.length === 0) {
    throw createHttpError(400, 'At least one transfer line is required');
  }

  const seen = new Set<string>();
  const deduped: Array<{ asset_item_id: string; notes?: string | null }> = [];
  normalized.forEach((line) => {
    if (seen.has(line.asset_item_id)) return;
    seen.add(line.asset_item_id);
    deduped.push(line);
  });

  return deduped;
}

function getTransferLineAssetIds(transfer: any) {
  const lineIds = Array.isArray(transfer.lines)
    ? transfer.lines
        .map((line: any) => (line?.asset_item_id ? String(line.asset_item_id) : null))
        .filter((id: string | null): id is string => Boolean(id))
    : [];
  if (lineIds.length > 0) return lineIds;
  // Back-compat for legacy transfer records before lines[] migration.
  if (transfer.asset_item_id) return [String(transfer.asset_item_id)];
  return [];
}

function ensureTransferLines(transfer: any) {
  if (Array.isArray(transfer.lines) && transfer.lines.length > 0) return;
  // Back-compat for legacy transfer records before lines[] migration.
  if (transfer.asset_item_id) {
    transfer.lines = [{ asset_item_id: transfer.asset_item_id, notes: null }];
  } else {
    transfer.lines = [];
  }
}

function normalizeTransferForResponse(transferDoc: any) {
  const transfer = typeof transferDoc.toJSON === 'function' ? transferDoc.toJSON() : transferDoc;
  ensureTransferLines(transfer);
  return transfer;
}

async function ensureOfficeExists(officeId: string) {
  const office = await OfficeModel.findById(officeId);
  if (!office) throw createHttpError(404, 'Office not found');
  return office;
}

async function resolveHeadOfficeStore() {
  const store = await StoreModel.findOne({
    code: HEAD_OFFICE_STORE_CODE,
    is_active: { $ne: false },
  });
  if (!store) {
    throw createHttpError(500, 'HEAD_OFFICE_STORE is not configured');
  }
  return store;
}

async function ensureDocumentExists(documentId: string, fieldName: string) {
  const exists = await DocumentModel.exists({ _id: documentId });
  if (!exists) {
    throw createHttpError(404, `${fieldName} not found`);
  }
}

function canApproveTransfer(access: Awaited<ReturnType<typeof resolveAccessContext>>, fromOfficeId: string) {
  if (access.isOrgAdmin) return true;
  return access.role === 'office_head' && access.officeId === fromOfficeId;
}

function canOperateSourceOffice(
  access: Awaited<ReturnType<typeof resolveAccessContext>>,
  fromOfficeId: string
) {
  if (access.isOrgAdmin) return true;
  return access.officeId === fromOfficeId && isOfficeManager(access.role);
}

function canOperateDestinationOffice(
  access: Awaited<ReturnType<typeof resolveAccessContext>>,
  toOfficeId: string
) {
  if (access.isOrgAdmin) return true;
  return access.officeId === toOfficeId && isOfficeManager(access.role);
}

async function loadTransferAssetItems(transfer: any, session?: mongoose.ClientSession) {
  const assetItemIds = getTransferLineAssetIds(transfer);
  if (assetItemIds.length === 0) {
    throw createHttpError(400, 'Transfer has no asset items');
  }
  const query = AssetItemModel.find({ _id: { $in: assetItemIds } });
  if (session) query.session(session);
  const items = await query;
  if (items.length !== assetItemIds.length) {
    throw createHttpError(404, 'One or more transfer asset items were not found');
  }
  return { items, assetItemIds };
}

async function updateTransferRecordStatus(
  access: Awaited<ReturnType<typeof resolveAccessContext>>,
  transferId: string,
  status: 'Approved' | 'Completed' | 'Rejected' | 'Cancelled',
  notes: string | undefined,
  session?: mongoose.ClientSession
) {
  const query = RecordModel.findOne({ record_type: 'TRANSFER', transfer_id: transferId });
  if (session) query.session(session);
  const record = await query;
  if (!record) return;

  try {
    await updateRecordStatus(
      {
        userId: access.userId,
        role: access.role,
        locationId: access.officeId,
        isOrgAdmin: access.isOrgAdmin,
      },
      record.id,
      status,
      notes,
      session
    );
  } catch {
    // Keep transfer state even if record state has stricter requirements.
  }
}

async function assertTransition(transfer: any, nextStatus: string) {
  const allowedNext = STATUS_FLOW[transfer.status] || [];
  if (!allowedNext.includes(nextStatus)) {
    throw createHttpError(400, `Invalid status transition from ${transfer.status} to ${nextStatus}`);
  }
}

export const transferController = {
  list: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const limit = clampInt(req.query.limit, 200, 1000);
      const page = clampInt(req.query.page, 1, 10_000);
      const access = await resolveAccessContext(req.user);
      const filter: Record<string, unknown> = { is_active: { $ne: false } };
      if (!access.isOrgAdmin) {
        if (!access.officeId) throw createHttpError(403, 'User is not assigned to an office');
        filter.$or = [{ from_office_id: access.officeId }, { to_office_id: access.officeId }];
      }

      const transfers = await TransferModel.find(filter)
        .sort({ transfer_date: -1 })
        .skip((page - 1) * limit)
        .limit(limit);

      res.json(transfers.map((transfer) => normalizeTransferForResponse(transfer)));
    } catch (error) {
      next(error);
    }
  },

  getById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const transfer = await TransferModel.findById(readParam(req, 'id'));
      if (!transfer) return res.status(404).json({ message: 'Not found' });

      const access = await resolveAccessContext(req.user);
      if (!access.isOrgAdmin) {
        const fromId = transfer.from_office_id?.toString();
        const toId = transfer.to_office_id?.toString();
        if (!fromId || !toId || (access.officeId !== fromId && access.officeId !== toId)) {
          throw createHttpError(403, 'Access restricted to assigned office');
        }
      }

      return res.json(normalizeTransferForResponse(transfer));
    } catch (error) {
      next(error);
    }
  },

  getByAssetItem: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const limit = clampInt(req.query.limit, 200, 1000);
      const page = clampInt(req.query.page, 1, 10_000);
      const access = await resolveAccessContext(req.user);
      const filter: Record<string, unknown> = {
        is_active: { $ne: false },
        // Back-compat for legacy transfer records before lines[] migration.
        $or: [{ asset_item_id: readParam(req, 'assetItemId') }, { 'lines.asset_item_id': readParam(req, 'assetItemId') }],
      };
      if (!access.isOrgAdmin) {
        if (!access.officeId) throw createHttpError(403, 'User is not assigned to an office');
        filter.$and = [
          {
            $or: [{ from_office_id: access.officeId }, { to_office_id: access.officeId }],
          },
        ];
      }

      const transfers = await TransferModel.find(filter)
        .sort({ transfer_date: -1 })
        .skip((page - 1) * limit)
        .limit(limit);

      res.json(transfers.map((transfer) => normalizeTransferForResponse(transfer)));
    } catch (error) {
      next(error);
    }
  },

  getByOffice: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const limit = clampInt(req.query.limit, 200, 1000);
      const page = clampInt(req.query.page, 1, 10_000);
      const access = await resolveAccessContext(req.user);
      if (!access.isOrgAdmin) {
        ensureOfficeScope(access, readParam(req, 'officeId'));
      }

      const transfers = await TransferModel.find({
        is_active: { $ne: false },
        $or: [{ from_office_id: readParam(req, 'officeId') }, { to_office_id: readParam(req, 'officeId') }],
      })
        .sort({ transfer_date: -1 })
        .skip((page - 1) * limit)
        .limit(limit);

      res.json(transfers.map((transfer) => normalizeTransferForResponse(transfer)));
    } catch (error) {
      next(error);
    }
  },

  create: async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    try {
      const access = await resolveAccessContext(req.user);
      if (!access.isOrgAdmin && !isOfficeManager(access.role)) {
        throw createHttpError(403, 'Not permitted to create transfers');
      }

      const body = req.body as Record<string, unknown>;
      const fromOfficeId = readId(body as Record<string, any>, [
        'fromOfficeId',
        'fromLocationId',
        'from_office_id',
        'from_location_id',
      ]);
      const toOfficeId = readId(body as Record<string, any>, [
        'toOfficeId',
        'toLocationId',
        'to_office_id',
        'to_location_id',
      ]);
      const lines = parseLinePayload(body.lines);

      if (!fromOfficeId || !toOfficeId) {
        throw createHttpError(400, 'from_office_id and to_office_id are required');
      }
      if (fromOfficeId === toOfficeId) {
        throw createHttpError(400, 'From and destination offices must be different');
      }
      if (!access.isOrgAdmin && access.officeId !== fromOfficeId && access.officeId !== toOfficeId) {
        throw createHttpError(403, 'Transfers must originate from or arrive at your office');
      }

      await ensureOfficeExists(fromOfficeId);
      await ensureOfficeExists(toOfficeId);
      const store = await resolveHeadOfficeStore();

      const lineAssetIds = lines.map((line) => line.asset_item_id);
      const assetItems = await AssetItemModel.find({ _id: { $in: lineAssetIds } });
      if (assetItems.length !== lineAssetIds.length) {
        throw createHttpError(404, 'One or more asset items were not found');
      }

      for (const item of assetItems) {
        if (item.is_active === false) {
          throw createHttpError(400, `Asset item ${item.id} is inactive`);
        }
        if (!isAssetItemHeldByOffice(item, fromOfficeId)) {
          throw createHttpError(400, `Asset item ${item.id} is not in the source office`);
        }
        if (item.assignment_status !== 'Unassigned') {
          throw createHttpError(400, `Asset item ${item.id} must be unassigned`);
        }
      }

      await session.withTransaction(async () => {
        const transferDate = body.transferDate || body.transfer_date;
        const notes = body.notes === undefined ? null : String(body.notes || '');
        const requisitionId = readId(body as Record<string, any>, ['requisitionId', 'requisition_id']);

        const transfer = await TransferModel.create(
          [
            {
              lines,
              from_office_id: fromOfficeId,
              to_office_id: toOfficeId,
              store_id: store.id,
              requisition_id: requisitionId || null,
              transfer_date: transferDate ? new Date(String(transferDate)) : new Date(),
              handled_by: access.userId,
              requested_by_user_id: access.userId,
              requested_at: new Date(),
              status: 'REQUESTED',
              notes,
              is_active: true,
            },
          ],
          { session }
        );

        const recordStatus = access.isOrgAdmin ? 'Approved' : 'PendingApproval';
        await createRecord(
          {
            userId: access.userId,
            role: access.role,
            locationId: access.officeId,
            isOrgAdmin: access.isOrgAdmin,
          },
          {
            recordType: 'TRANSFER',
            officeId: fromOfficeId,
            status: recordStatus,
            assetItemId: lines[0]?.asset_item_id || undefined,
            transferId: transfer[0].id,
            notes: notes || undefined,
          },
          session
        );

        await logAudit({
          ctx: {
            userId: access.userId,
            role: access.role,
            locationId: access.officeId,
            isOrgAdmin: access.isOrgAdmin,
          },
          action: 'TRANSFER_CREATE',
          entityType: 'Transfer',
          entityId: transfer[0].id,
          officeId: fromOfficeId,
          diff: { status: 'REQUESTED', lineCount: lines.length },
          session,
        });

        res.status(201).json(normalizeTransferForResponse(transfer[0]));
      });
    } catch (error) {
      next(error);
    } finally {
      session.endSession();
    }
  },

  approve: async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    try {
      const access = await resolveAccessContext(req.user);
      const transfer = await TransferModel.findById(readParam(req, 'id'));
      if (!transfer) return res.status(404).json({ message: 'Not found' });

      const fromOfficeId = String(transfer.from_office_id || '');
      if (!canApproveTransfer(access, fromOfficeId)) {
        throw createHttpError(403, 'Not permitted to approve this transfer');
      }
      await assertTransition(transfer, 'APPROVED');

      await session.withTransaction(async () => {
        transfer.status = 'APPROVED';
        transfer.approved_by_user_id = access.userId;
        transfer.approved_at = new Date();
        transfer.handled_by = access.userId;
        await transfer.save({ session });

        await updateTransferRecordStatus(access, transfer.id, 'Approved', transfer.notes || undefined, session);
      });

      res.json(normalizeTransferForResponse(transfer));
    } catch (error) {
      next(error);
    } finally {
      session.endSession();
    }
  },

  dispatchToStore: async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    try {
      const access = await resolveAccessContext(req.user);
      const transfer = await TransferModel.findById(readParam(req, 'id'));
      if (!transfer) return res.status(404).json({ message: 'Not found' });

      const fromOfficeId = String(transfer.from_office_id || '');
      if (!canOperateSourceOffice(access, fromOfficeId)) {
        throw createHttpError(403, 'Not permitted to dispatch this transfer');
      }
      await assertTransition(transfer, 'DISPATCHED_TO_STORE');

      const handoverDocumentId = readId(req.body as Record<string, any>, [
        'handoverDocumentId',
        'handover_document_id',
      ]);
      const effectiveHandoverDocumentId = handoverDocumentId || (transfer.handover_document_id ? String(transfer.handover_document_id) : null);
      if (!effectiveHandoverDocumentId) {
        throw createHttpError(400, 'handover_document_id is required before dispatching to store');
      }
      await ensureDocumentExists(effectiveHandoverDocumentId, 'Handover document');

      const { assetItemIds } = await loadTransferAssetItems(transfer);
      await session.withTransaction(async () => {
        transfer.status = 'DISPATCHED_TO_STORE';
        transfer.handled_by = access.userId;
        transfer.handover_document_id = effectiveHandoverDocumentId as any;
        transfer.dispatched_to_store_by_user_id = access.userId;
        transfer.dispatched_to_store_at = new Date();
        transfer.dispatched_by_user_id = access.userId;
        transfer.dispatched_at = transfer.dispatched_to_store_at;
        await transfer.save({ session });

        await AssetItemModel.updateMany(
          { _id: { $in: assetItemIds }, ...officeAssetItemFilter(fromOfficeId) },
          { assignment_status: 'InTransit', item_status: 'InTransit' },
          { session }
        );
      });

      res.json(normalizeTransferForResponse(transfer));
    } catch (error) {
      next(error);
    } finally {
      session.endSession();
    }
  },

  receiveAtStore: async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    try {
      const access = await resolveAccessContext(req.user);
      if (!access.isOrgAdmin) {
        throw createHttpError(403, 'Only org_admin can receive transfers at system store');
      }

      const transfer = await TransferModel.findById(readParam(req, 'id'));
      if (!transfer) return res.status(404).json({ message: 'Not found' });
      await assertTransition(transfer, 'RECEIVED_AT_STORE');

      const { assetItemIds } = await loadTransferAssetItems(transfer);
      const store = transfer.store_id ? await StoreModel.findById(transfer.store_id) : await resolveHeadOfficeStore();
      if (!store) {
        throw createHttpError(500, 'Transfer store is not configured');
      }

      await session.withTransaction(async () => {
        transfer.status = 'RECEIVED_AT_STORE';
        transfer.handled_by = access.userId;
        transfer.store_id = store.id;
        transfer.received_at_store_by_user_id = access.userId;
        transfer.received_at_store_at = new Date();
        await transfer.save({ session });

        await AssetItemModel.updateMany(
          { _id: { $in: assetItemIds } },
          {
            ...setAssetItemStoreHolderUpdate(store.id),
            assignment_status: 'InTransit',
            item_status: 'InTransit',
          },
          { session }
        );
      });

      res.json(normalizeTransferForResponse(transfer));
    } catch (error) {
      next(error);
    } finally {
      session.endSession();
    }
  },

  dispatchToDest: async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    try {
      const access = await resolveAccessContext(req.user);
      if (!access.isOrgAdmin) {
        throw createHttpError(403, 'Only org_admin can dispatch from system store');
      }

      const transfer = await TransferModel.findById(readParam(req, 'id'));
      if (!transfer) return res.status(404).json({ message: 'Not found' });
      await assertTransition(transfer, 'DISPATCHED_TO_DEST');

      await session.withTransaction(async () => {
        transfer.status = 'DISPATCHED_TO_DEST';
        transfer.handled_by = access.userId;
        transfer.dispatched_to_dest_by_user_id = access.userId;
        transfer.dispatched_to_dest_at = new Date();
        transfer.dispatched_by_user_id = access.userId;
        transfer.dispatched_at = transfer.dispatched_to_dest_at;
        await transfer.save({ session });
      });

      res.json(normalizeTransferForResponse(transfer));
    } catch (error) {
      next(error);
    } finally {
      session.endSession();
    }
  },

  receiveAtDest: async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    try {
      const access = await resolveAccessContext(req.user);
      const transfer = await TransferModel.findById(readParam(req, 'id'));
      if (!transfer) return res.status(404).json({ message: 'Not found' });

      const toOfficeId = String(transfer.to_office_id || '');
      if (!canOperateDestinationOffice(access, toOfficeId)) {
        throw createHttpError(403, 'Not permitted to receive this transfer');
      }
      await assertTransition(transfer, 'RECEIVED_AT_DEST');

      const takeoverDocumentId = readId(req.body as Record<string, any>, [
        'takeoverDocumentId',
        'takeover_document_id',
      ]);
      const effectiveTakeoverDocumentId = takeoverDocumentId || (transfer.takeover_document_id ? String(transfer.takeover_document_id) : null);
      if (!effectiveTakeoverDocumentId) {
        throw createHttpError(400, 'takeover_document_id is required before receiving at destination');
      }
      await ensureDocumentExists(effectiveTakeoverDocumentId, 'Takeover document');

      const { items, assetItemIds } = await loadTransferAssetItems(transfer);
      for (const item of items) {
        if (item.assignment_status === 'Assigned') {
          throw createHttpError(400, `Asset item ${item.id} is assigned and cannot be received`);
        }
        await enforceAssetCategoryScopeForOffice(String(item.asset_id), toOfficeId);
      }

      await session.withTransaction(async () => {
        transfer.status = 'RECEIVED_AT_DEST';
        transfer.handled_by = access.userId;
        transfer.takeover_document_id = effectiveTakeoverDocumentId as any;
        transfer.received_at_dest_by_user_id = access.userId;
        transfer.received_at_dest_at = new Date();
        transfer.received_by_user_id = access.userId;
        transfer.received_at = transfer.received_at_dest_at;
        await transfer.save({ session });

        await AssetItemModel.updateMany(
          { _id: { $in: assetItemIds } },
          {
            ...setAssetItemOfficeHolderUpdate(toOfficeId),
            assignment_status: 'Unassigned',
            item_status: 'Available',
          },
          { session }
        );

        await updateTransferRecordStatus(access, transfer.id, 'Completed', transfer.notes || undefined, session);
      });

      res.json(normalizeTransferForResponse(transfer));
    } catch (error) {
      next(error);
    } finally {
      session.endSession();
    }
  },

  reject: async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    try {
      const access = await resolveAccessContext(req.user);
      const transfer = await TransferModel.findById(readParam(req, 'id'));
      if (!transfer) return res.status(404).json({ message: 'Not found' });

      const fromOfficeId = String(transfer.from_office_id || '');
      if (!canApproveTransfer(access, fromOfficeId)) {
        throw createHttpError(403, 'Not permitted to reject this transfer');
      }
      await assertTransition(transfer, 'REJECTED');

      const rollbackStatuses = new Set(['DISPATCHED_TO_STORE', 'RECEIVED_AT_STORE', 'DISPATCHED_TO_DEST']);
      const shouldRollbackItems = rollbackStatuses.has(String(transfer.status));
      const { assetItemIds } = shouldRollbackItems ? await loadTransferAssetItems(transfer) : { assetItemIds: [] as string[] };

      await session.withTransaction(async () => {
        transfer.status = 'REJECTED';
        transfer.handled_by = access.userId;
        transfer.rejected_by_user_id = access.userId;
        transfer.rejected_at = new Date();
        await transfer.save({ session });

        if (shouldRollbackItems && assetItemIds.length > 0) {
          await AssetItemModel.updateMany(
            { _id: { $in: assetItemIds } },
            {
              ...setAssetItemOfficeHolderUpdate(fromOfficeId),
              assignment_status: 'Unassigned',
              item_status: 'Available',
            },
            { session }
          );
        }

        await updateTransferRecordStatus(access, transfer.id, 'Rejected', transfer.notes || undefined, session);
      });

      res.json(normalizeTransferForResponse(transfer));
    } catch (error) {
      next(error);
    } finally {
      session.endSession();
    }
  },

  cancel: async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    try {
      const access = await resolveAccessContext(req.user);
      const transfer = await TransferModel.findById(readParam(req, 'id'));
      if (!transfer) return res.status(404).json({ message: 'Not found' });

      const fromOfficeId = String(transfer.from_office_id || '');
      if (!canOperateSourceOffice(access, fromOfficeId) && !canApproveTransfer(access, fromOfficeId)) {
        throw createHttpError(403, 'Not permitted to cancel this transfer');
      }
      await assertTransition(transfer, 'CANCELLED');

      const rollbackStatuses = new Set(['DISPATCHED_TO_STORE', 'RECEIVED_AT_STORE', 'DISPATCHED_TO_DEST']);
      const shouldRollbackItems = rollbackStatuses.has(String(transfer.status));
      const { assetItemIds } = shouldRollbackItems ? await loadTransferAssetItems(transfer) : { assetItemIds: [] as string[] };

      await session.withTransaction(async () => {
        transfer.status = 'CANCELLED';
        transfer.handled_by = access.userId;
        transfer.cancelled_by_user_id = access.userId;
        transfer.cancelled_at = new Date();
        await transfer.save({ session });

        if (shouldRollbackItems && assetItemIds.length > 0) {
          await AssetItemModel.updateMany(
            { _id: { $in: assetItemIds } },
            {
              ...setAssetItemOfficeHolderUpdate(fromOfficeId),
              assignment_status: 'Unassigned',
              item_status: 'Available',
            },
            { session }
          );
        }

        await updateTransferRecordStatus(access, transfer.id, 'Cancelled', transfer.notes || undefined, session);
      });

      res.json(normalizeTransferForResponse(transfer));
    } catch (error) {
      next(error);
    } finally {
      session.endSession();
    }
  },

  remove: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      if (!access.isOrgAdmin) {
        throw createHttpError(403, 'Only org_admin can retire transfers');
      }
      const transfer = await TransferModel.findById(readParam(req, 'id'));
      if (!transfer) return res.status(404).json({ message: 'Not found' });
      transfer.is_active = false;
      await transfer.save();
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};




