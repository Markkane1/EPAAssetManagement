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

import {
  HEAD_OFFICE_STORE_CODE,
  STATUS_FLOW,
  readParam,
  clampInt,
  readId,
  parseLinePayload,
  getTransferLineAssetIds,
  ensureTransferLines,
  normalizeTransferForResponse,
  ensureOfficeExists,
  resolveHeadOfficeStore,
  ensureDocumentExists,
  canApproveTransfer,
  canOperateSourceOffice,
  canOperateDestinationOffice,
  loadTransferAssetItems,
  updateTransferRecordStatus,
  assertTransition,
} from './transfer.controller.helpers';

const NON_REPLICA_TX_ERROR = 'Transaction numbers are only allowed on a replica set member or mongos';

function withSession(session?: mongoose.ClientSession) {
  return session ? { session } : undefined;
}

function isStandaloneTransactionError(error: unknown) {
  return error instanceof Error && error.message.includes(NON_REPLICA_TX_ERROR);
}

async function runWithOptionalTransaction(
  session: mongoose.ClientSession,
  handler: (session?: mongoose.ClientSession) => Promise<void>
) {
  try {
    await session.withTransaction(async () => {
      await handler(session);
    });
  } catch (error) {
    if (!isStandaloneTransactionError(error)) throw error;
    await handler();
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
        'lines.asset_item_id': readParam(req, 'assetItemId'),
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
      const requestedFromOfficeId = readId(body as Record<string, any>, [
        'fromOfficeId',
        'from_office_id',
      ]);
      const requestedToOfficeId = readId(body as Record<string, any>, [
        'toOfficeId',
        'to_office_id',
      ]);
      const approvalOrderDocumentId = readId(body as Record<string, any>, [
        'approvalOrderDocumentId',
        'approval_order_document_id',
      ]);
      const lines = parseLinePayload(body.lines);

      if (!requestedFromOfficeId || !requestedToOfficeId) {
        throw createHttpError(400, 'from_office_id and to_office_id are required');
      }
      if (!approvalOrderDocumentId) {
        throw createHttpError(400, 'approval_order_document_id is required');
      }
      await ensureDocumentExists(approvalOrderDocumentId, 'Approval order document');
      const isFromCentralStore = requestedFromOfficeId === HEAD_OFFICE_STORE_CODE;
      const isToCentralStore = requestedToOfficeId === HEAD_OFFICE_STORE_CODE;
      if (isFromCentralStore && !access.isOrgAdmin) {
        throw createHttpError(403, 'Only org_admin can transfer from Central Store');
      }

      if (requestedFromOfficeId === requestedToOfficeId) {
        throw createHttpError(400, 'From and destination offices must be different');
      }
      if (
        !access.isOrgAdmin &&
        access.officeId !== requestedFromOfficeId &&
        access.officeId !== requestedToOfficeId
      ) {
        throw createHttpError(403, 'Transfers must originate from or arrive at your office');
      }

      const store = await resolveHeadOfficeStore();
      const fromOfficeId = isFromCentralStore ? String(store.id) : requestedFromOfficeId;
      const toOfficeId = isToCentralStore ? String(store.id) : requestedToOfficeId;

      if (fromOfficeId === toOfficeId) {
        throw createHttpError(400, 'From and destination offices must be different');
      }

      if (!isFromCentralStore) {
        await ensureOfficeExists(fromOfficeId);
      }
      if (!isToCentralStore) {
        await ensureOfficeExists(toOfficeId);
      }

      const lineAssetIds = lines.map((line) => line.asset_item_id);
      const assetItems = await AssetItemModel.find({ _id: { $in: lineAssetIds } });
      if (assetItems.length !== lineAssetIds.length) {
        throw createHttpError(404, 'One or more asset items were not found');
      }

      for (const item of assetItems) {
        if (item.is_active === false) {
          throw createHttpError(400, `Asset item ${item.id} is inactive`);
        }
        if (isFromCentralStore) {
          const isInStore =
            String(item.holder_type || '') === 'STORE' &&
            String(item.holder_id || '') === String(store.id);
          if (!isInStore) {
            throw createHttpError(400, `Asset item ${item.id} is not in Central Store`);
          }
        } else if (!isAssetItemHeldByOffice(item, fromOfficeId)) {
          throw createHttpError(400, `Asset item ${item.id} is not in the source office`);
        }
        if (item.assignment_status !== 'Unassigned') {
          throw createHttpError(400, `Asset item ${item.id} must be unassigned`);
        }
      }

      let createdTransfer: any = null;
      await runWithOptionalTransaction(session, async (txSession) => {
        const transferDate = body.transferDate || body.transfer_date;
        const notes = body.notes === undefined ? null : String(body.notes || '');
        const requisitionId = readId(body as Record<string, any>, ['requisitionId', 'requisition_id']);
        const workflowTimestamp = new Date();
        const initialStatus = isFromCentralStore ? 'RECEIVED_AT_STORE' : 'REQUESTED';

        const transfer = await TransferModel.create(
          [
            {
              lines,
              from_office_id: fromOfficeId,
              to_office_id: toOfficeId,
              store_id: store.id,
              requisition_id: requisitionId || null,
              approval_order_document_id: approvalOrderDocumentId,
              transfer_date: transferDate ? new Date(String(transferDate)) : new Date(),
              handled_by: access.userId,
              requested_by_user_id: access.userId,
              requested_at: workflowTimestamp,
              approved_by_user_id: isFromCentralStore ? access.userId : null,
              approved_at: isFromCentralStore ? workflowTimestamp : null,
              received_at_store_by_user_id: isFromCentralStore ? access.userId : null,
              received_at_store_at: isFromCentralStore ? workflowTimestamp : null,
              status: initialStatus,
              notes,
              is_active: true,
            },
          ],
          withSession(txSession)
        );
        const created = transfer[0];
        createdTransfer = created;

        const recordStatus = access.isOrgAdmin || isFromCentralStore ? 'Approved' : 'PendingApproval';
        await createRecord(
          {
            userId: access.userId,
            role: access.role,
            locationId: access.officeId,
            isOrgAdmin: access.isOrgAdmin,
          },
          {
            recordType: 'TRANSFER',
            officeId: isFromCentralStore ? toOfficeId : fromOfficeId,
            status: recordStatus,
            assetItemId: lines[0]?.asset_item_id || undefined,
            transferId: created.id,
            notes: notes || undefined,
          },
          txSession
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
          entityId: created.id,
          officeId: isFromCentralStore ? toOfficeId : fromOfficeId,
          diff: { status: initialStatus, lineCount: lines.length, source: isFromCentralStore ? 'STORE' : 'OFFICE' },
          session: txSession,
        });
      });
      if (!createdTransfer) throw createHttpError(500, 'Failed to create transfer');
      res.status(201).json(normalizeTransferForResponse(createdTransfer));
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

      await runWithOptionalTransaction(session, async (txSession) => {
        transfer.status = 'APPROVED';
        transfer.approved_by_user_id = access.userId;
        transfer.approved_at = new Date();
        transfer.handled_by = access.userId;
        await transfer.save(withSession(txSession));

        await updateTransferRecordStatus(access, transfer.id, 'Approved', transfer.notes || undefined, txSession);
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
      await runWithOptionalTransaction(session, async (txSession) => {
        transfer.status = 'DISPATCHED_TO_STORE';
        transfer.handled_by = access.userId;
        transfer.handover_document_id = effectiveHandoverDocumentId as any;
        transfer.dispatched_to_store_by_user_id = access.userId;
        transfer.dispatched_to_store_at = new Date();
        transfer.dispatched_by_user_id = access.userId;
        await transfer.save(withSession(txSession));

        await AssetItemModel.updateMany(
          { _id: { $in: assetItemIds }, ...officeAssetItemFilter(fromOfficeId) },
          { assignment_status: 'InTransit', item_status: 'Transferred' },
          withSession(txSession)
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

      await runWithOptionalTransaction(session, async (txSession) => {
        transfer.status = 'RECEIVED_AT_STORE';
        transfer.handled_by = access.userId;
        transfer.store_id = store.id;
        transfer.received_at_store_by_user_id = access.userId;
        transfer.received_at_store_at = new Date();
        await transfer.save(withSession(txSession));

        await AssetItemModel.updateMany(
          { _id: { $in: assetItemIds } },
          {
            ...setAssetItemStoreHolderUpdate(store.id),
            assignment_status: 'InTransit',
            item_status: 'Transferred',
          },
          withSession(txSession)
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

      await runWithOptionalTransaction(session, async (txSession) => {
        transfer.status = 'DISPATCHED_TO_DEST';
        transfer.handled_by = access.userId;
        transfer.dispatched_to_dest_by_user_id = access.userId;
        transfer.dispatched_to_dest_at = new Date();
        transfer.dispatched_by_user_id = access.userId;
        await transfer.save(withSession(txSession));
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

      await runWithOptionalTransaction(session, async (txSession) => {
        transfer.status = 'RECEIVED_AT_DEST';
        transfer.handled_by = access.userId;
        transfer.takeover_document_id = effectiveTakeoverDocumentId as any;
        transfer.received_at_dest_by_user_id = access.userId;
        transfer.received_at_dest_at = new Date();
        transfer.received_by_user_id = access.userId;
        await transfer.save(withSession(txSession));

        await AssetItemModel.updateMany(
          { _id: { $in: assetItemIds } },
          {
            ...setAssetItemOfficeHolderUpdate(toOfficeId),
            assignment_status: 'Unassigned',
            item_status: 'Transferred',
          },
          withSession(txSession)
        );

        await updateTransferRecordStatus(access, transfer.id, 'Completed', transfer.notes || undefined, txSession);
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
      const sourceIsStore = Boolean(transfer.store_id) && String(transfer.store_id) === fromOfficeId;
      const sourceHolderUpdate = sourceIsStore
        ? setAssetItemStoreHolderUpdate(String(transfer.store_id))
        : setAssetItemOfficeHolderUpdate(fromOfficeId);

      await runWithOptionalTransaction(session, async (txSession) => {
        transfer.status = 'REJECTED';
        transfer.handled_by = access.userId;
        transfer.rejected_by_user_id = access.userId;
        transfer.rejected_at = new Date();
        await transfer.save(withSession(txSession));

        if (shouldRollbackItems && assetItemIds.length > 0) {
          await AssetItemModel.updateMany(
            { _id: { $in: assetItemIds } },
            {
              ...sourceHolderUpdate,
              assignment_status: 'Unassigned',
              item_status: 'Available',
            },
            withSession(txSession)
          );
        }

        await updateTransferRecordStatus(access, transfer.id, 'Rejected', transfer.notes || undefined, txSession);
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
      const sourceIsStore = Boolean(transfer.store_id) && String(transfer.store_id) === fromOfficeId;
      const sourceHolderUpdate = sourceIsStore
        ? setAssetItemStoreHolderUpdate(String(transfer.store_id))
        : setAssetItemOfficeHolderUpdate(fromOfficeId);

      await runWithOptionalTransaction(session, async (txSession) => {
        transfer.status = 'CANCELLED';
        transfer.handled_by = access.userId;
        transfer.cancelled_by_user_id = access.userId;
        transfer.cancelled_at = new Date();
        await transfer.save(withSession(txSession));

        if (shouldRollbackItems && assetItemIds.length > 0) {
          await AssetItemModel.updateMany(
            { _id: { $in: assetItemIds } },
            {
              ...sourceHolderUpdate,
              assignment_status: 'Unassigned',
              item_status: 'Available',
            },
            withSession(txSession)
          );
        }

        await updateTransferRecordStatus(access, transfer.id, 'Cancelled', transfer.notes || undefined, txSession);
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




