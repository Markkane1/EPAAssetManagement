import mongoose from 'mongoose';
import { Response, NextFunction } from 'express';
import { TransferModel } from '../models/transfer.model';
import { AssetItemModel } from '../models/assetItem.model';
import { AssetModel } from '../models/asset.model';
import { OfficeModel } from '../models/office.model';
import { StoreModel } from '../models/store.model';
import { DocumentModel } from '../models/document.model';
import type { AuthRequest } from '../middleware/auth';
import { resolveAccessContext, ensureOfficeScope } from '../utils/accessControl';
import { createHttpError } from '../utils/httpError';
import { createRecord, updateRecordStatus } from '../modules/records/services/record.service';
import { logAudit } from '../modules/records/services/audit.service';
import { RecordModel } from '../models/record.model';
import { enforceAssetCategoryScopeForOffice } from '../utils/categoryScope';
import { createBulkNotifications, resolveNotificationRecipientsByOffice } from '../services/notification.service';
import { enforceAccessPolicy } from '../services/policyEngine.service';
import { enforceApprovalMatrix, markApprovalWorkflowExecuted } from '../services/approvalMatrix.service';
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
  loadTransferAssetItems,
  updateTransferRecordStatus,
  assertTransition,
} from './transfer.controller.helpers';

function withSession(session?: mongoose.ClientSession) {
  return session ? { session } : undefined;
}

async function resolveTransferNotificationContext(transfer: any) {
  const fromId = String(transfer?.from_office_id || '').trim();
  const toId = String(transfer?.to_office_id || '').trim();
  const officeCandidates = [fromId, toId].filter((value) => mongoose.Types.ObjectId.isValid(value));
  const offices = officeCandidates.length
    ? await OfficeModel.find({ _id: { $in: officeCandidates } }, { _id: 1, name: 1 }).lean().exec()
    : [];
  const officeNameById = new Map(offices.map((office: any) => [String(office._id), String(office.name || 'Office')]));
  const officeIds = Array.from(new Set(offices.map((office: any) => String(office._id))));
  return {
    officeIds,
    fromLabel: officeNameById.get(fromId) || 'Central Store',
    toLabel: officeNameById.get(toId) || 'Central Store',
  };
}

function toTransferId(transfer: any) {
  if (transfer?._id) return String(transfer._id);
  if (transfer?.id) return String(transfer.id);
  return '';
}

async function notifyTransferLifecycle(input: {
  transfer: any;
  type:
    | 'TRANSFER_REQUESTED'
    | 'TRANSFER_APPROVED'
    | 'TRANSFER_REJECTED'
    | 'TRANSFER_DISPATCHED'
    | 'TRANSFER_RECEIVED'
    | 'TRANSFER_CANCELLED';
  title: string;
  message: string;
  excludeUserIds?: string[];
}) {
  const transferId = toTransferId(input.transfer);
  if (!transferId || !mongoose.Types.ObjectId.isValid(transferId)) return;

  const context = await resolveTransferNotificationContext(input.transfer);
  if (context.officeIds.length === 0) return;

  const recipients = await resolveNotificationRecipientsByOffice({
    officeIds: context.officeIds,
    includeOrgAdmins: true,
    includeRoles: ['office_head', 'caretaker'],
    excludeUserIds: input.excludeUserIds,
  });
  if (recipients.length === 0) return;

  await createBulkNotifications(
    recipients.map((recipientUserId) => ({
      recipientUserId,
      officeId: context.officeIds[0],
      type: input.type,
      title: input.title,
      message: input.message,
      entityType: 'Transfer',
      entityId: transferId,
      dedupeWindowHours: 24,
    }))
  );
}

async function runWithTransaction(
  session: mongoose.ClientSession,
  handler: (session: mongoose.ClientSession) => Promise<void>
) {
  await session.withTransaction(async () => {
    await handler(session);
  });
}

function toPolicyActor(access: Awaited<ReturnType<typeof resolveAccessContext>>, req: AuthRequest) {
  return {
    userId: access.userId,
    role: access.role,
    roles: req.user?.roles || [access.role],
    officeId: access.officeId,
    isOrgAdmin: access.isOrgAdmin,
  };
}

async function resolveTransferApprovalRiskProfile(transfer: any) {
  const assetItemIds = getTransferLineAssetIds(transfer);
  const lineCount = assetItemIds.length;
  if (lineCount === 0) {
    return {
      amount: 0,
      lineCount: 0,
      riskTags: [] as string[],
    };
  }

  const riskRows = await AssetItemModel.aggregate<{ totalAmount: number }>([
    {
      $match: {
        _id: { $in: assetItemIds.map((id) => new mongoose.Types.ObjectId(id)) },
      },
    },
    {
      $lookup: {
        from: AssetModel.collection.name,
        localField: 'asset_id',
        foreignField: '_id',
        as: 'asset',
      },
    },
    {
      $set: {
        asset: { $ifNull: [{ $arrayElemAt: ['$asset', 0] }, null] },
      },
    },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: { $ifNull: ['$asset.unit_price', 0] } },
      },
    },
  ]).exec();
  const amount = Number(riskRows[0]?.totalAmount || 0);

  const riskTags: string[] = [];
  if (lineCount >= 10) riskTags.push('BULK');
  if (String(transfer.from_office_id || '') !== String(transfer.to_office_id || '')) {
    riskTags.push('INTER_OFFICE');
  }
  return {
    amount,
    lineCount,
    riskTags,
  };
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

      const policyScopeOfficeId = isFromCentralStore ? requestedToOfficeId : requestedFromOfficeId;
      await enforceAccessPolicy({
        action: 'transfer.create',
        actor: toPolicyActor(access, req),
        targetOfficeId: policyScopeOfficeId,
        errorMessage: 'Not permitted to create transfers',
      });

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
      await runWithTransaction(session, async (txSession) => {
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

      const transferContext = await resolveTransferNotificationContext(createdTransfer);
      await notifyTransferLifecycle({
        transfer: createdTransfer,
        type: 'TRANSFER_REQUESTED',
        title: 'Transfer Requested',
        message: `Transfer requested from ${transferContext.fromLabel} to ${transferContext.toLabel}.`,
        excludeUserIds: [access.userId],
      });
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
      await enforceAccessPolicy({
        action: 'transfer.approve',
        actor: toPolicyActor(access, req),
        targetOfficeId: fromOfficeId,
        errorMessage: 'Not permitted to approve this transfer',
      });
      await assertTransition(transfer, 'APPROVED');

      const approvalWorkflowId = readId(req.body as Record<string, any>, [
        'approvalWorkflowId',
        'approval_workflow_id',
      ]);
      const riskProfile = await resolveTransferApprovalRiskProfile(transfer);
      const approvalGate = await enforceApprovalMatrix({
        transactionType: 'TRANSFER_APPROVAL',
        makerUserId: access.userId,
        makerRoles: req.user?.roles || [access.role],
        makerOfficeId: fromOfficeId,
        amount: riskProfile.amount,
        riskTags: riskProfile.riskTags,
        entityType: 'Transfer',
        entityId: transfer.id,
        payloadDigestInput: {
          transferId: transfer.id,
          fromOfficeId,
          toOfficeId: String(transfer.to_office_id || ''),
          lineCount: riskProfile.lineCount,
          amount: riskProfile.amount,
        },
        approvalWorkflowId,
      });
      if (approvalGate.status === 'pending') {
        return res.status(409).json({
          message: 'Approval workflow is required before approving this transfer',
          details: {
            approval_request: approvalGate.request,
          },
        });
      }

      await runWithTransaction(session, async (txSession) => {
        transfer.status = 'APPROVED';
        transfer.approved_by_user_id = access.userId;
        transfer.approved_at = new Date();
        transfer.handled_by = access.userId;
        await transfer.save(withSession(txSession));

        await updateTransferRecordStatus(access, transfer.id, 'Approved', transfer.notes || undefined, txSession);
      });
      if (approvalGate.workflowIdToExecute) {
        await markApprovalWorkflowExecuted(approvalGate.workflowIdToExecute);
      }

      const transferContext = await resolveTransferNotificationContext(transfer);
      await notifyTransferLifecycle({
        transfer,
        type: 'TRANSFER_APPROVED',
        title: 'Transfer Approved',
        message: `Transfer approved from ${transferContext.fromLabel} to ${transferContext.toLabel}.`,
        excludeUserIds: [access.userId],
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
      await enforceAccessPolicy({
        action: 'transfer.operate_source',
        actor: toPolicyActor(access, req),
        targetOfficeId: fromOfficeId,
        errorMessage: 'Not permitted to dispatch this transfer',
      });
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
      await runWithTransaction(session, async (txSession) => {
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

      const transferContext = await resolveTransferNotificationContext(transfer);
      await notifyTransferLifecycle({
        transfer,
        type: 'TRANSFER_DISPATCHED',
        title: 'Transfer Dispatched',
        message: `Transfer dispatched from ${transferContext.fromLabel} for ${transferContext.toLabel}.`,
        excludeUserIds: [access.userId],
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
      await enforceAccessPolicy({
        action: 'transfer.central_store_receive',
        actor: toPolicyActor(access, req),
        errorMessage: 'Not permitted to receive transfers at system store',
      });

      const transfer = await TransferModel.findById(readParam(req, 'id'));
      if (!transfer) return res.status(404).json({ message: 'Not found' });
      await assertTransition(transfer, 'RECEIVED_AT_STORE');

      const { assetItemIds } = await loadTransferAssetItems(transfer);
      const store = transfer.store_id ? await StoreModel.findById(transfer.store_id) : await resolveHeadOfficeStore();
      if (!store) {
        throw createHttpError(500, 'Transfer store is not configured');
      }

      await runWithTransaction(session, async (txSession) => {
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

      const transferContext = await resolveTransferNotificationContext(transfer);
      await notifyTransferLifecycle({
        transfer,
        type: 'TRANSFER_RECEIVED',
        title: 'Transfer Received At Store',
        message: `Transfer from ${transferContext.fromLabel} has been received at Central Store.`,
        excludeUserIds: [access.userId],
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
      await enforceAccessPolicy({
        action: 'transfer.central_store_dispatch',
        actor: toPolicyActor(access, req),
        errorMessage: 'Not permitted to dispatch from system store',
      });

      const transfer = await TransferModel.findById(readParam(req, 'id'));
      if (!transfer) return res.status(404).json({ message: 'Not found' });
      await assertTransition(transfer, 'DISPATCHED_TO_DEST');

      await runWithTransaction(session, async (txSession) => {
        transfer.status = 'DISPATCHED_TO_DEST';
        transfer.handled_by = access.userId;
        transfer.dispatched_to_dest_by_user_id = access.userId;
        transfer.dispatched_to_dest_at = new Date();
        transfer.dispatched_by_user_id = access.userId;
        await transfer.save(withSession(txSession));
      });

      const transferContext = await resolveTransferNotificationContext(transfer);
      await notifyTransferLifecycle({
        transfer,
        type: 'TRANSFER_DISPATCHED',
        title: 'Transfer Sent To Destination',
        message: `Transfer is on the way to ${transferContext.toLabel}.`,
        excludeUserIds: [access.userId],
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
      await enforceAccessPolicy({
        action: 'transfer.operate_destination',
        actor: toPolicyActor(access, req),
        targetOfficeId: toOfficeId,
        errorMessage: 'Not permitted to receive this transfer',
      });
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

      await runWithTransaction(session, async (txSession) => {
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

      const transferContext = await resolveTransferNotificationContext(transfer);
      await notifyTransferLifecycle({
        transfer,
        type: 'TRANSFER_RECEIVED',
        title: 'Transfer Completed',
        message: `Transfer from ${transferContext.fromLabel} has been received at ${transferContext.toLabel}.`,
        excludeUserIds: [access.userId],
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
      await enforceAccessPolicy({
        action: 'transfer.approve',
        actor: toPolicyActor(access, req),
        targetOfficeId: fromOfficeId,
        errorMessage: 'Not permitted to reject this transfer',
      });
      await assertTransition(transfer, 'REJECTED');

      const rollbackStatuses = new Set(['DISPATCHED_TO_STORE', 'RECEIVED_AT_STORE', 'DISPATCHED_TO_DEST']);
      const shouldRollbackItems = rollbackStatuses.has(String(transfer.status));
      const { assetItemIds } = shouldRollbackItems ? await loadTransferAssetItems(transfer) : { assetItemIds: [] as string[] };
      const sourceIsStore = Boolean(transfer.store_id) && String(transfer.store_id) === fromOfficeId;
      const sourceHolderUpdate = sourceIsStore
        ? setAssetItemStoreHolderUpdate(String(transfer.store_id))
        : setAssetItemOfficeHolderUpdate(fromOfficeId);

      await runWithTransaction(session, async (txSession) => {
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

      const transferContext = await resolveTransferNotificationContext(transfer);
      await notifyTransferLifecycle({
        transfer,
        type: 'TRANSFER_REJECTED',
        title: 'Transfer Rejected',
        message: `Transfer from ${transferContext.fromLabel} to ${transferContext.toLabel} was rejected.`,
        excludeUserIds: [access.userId],
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
      const policyActor = toPolicyActor(access, req);
      let canCancel = false;
      try {
        await enforceAccessPolicy({
          action: 'transfer.operate_source',
          actor: policyActor,
          targetOfficeId: fromOfficeId,
          errorMessage: 'Not permitted to cancel this transfer',
        });
        canCancel = true;
      } catch {
        canCancel = false;
      }
      if (!canCancel) {
        await enforceAccessPolicy({
          action: 'transfer.approve',
          actor: policyActor,
          targetOfficeId: fromOfficeId,
          errorMessage: 'Not permitted to cancel this transfer',
        });
      }
      await assertTransition(transfer, 'CANCELLED');

      const rollbackStatuses = new Set(['DISPATCHED_TO_STORE', 'RECEIVED_AT_STORE', 'DISPATCHED_TO_DEST']);
      const shouldRollbackItems = rollbackStatuses.has(String(transfer.status));
      const { assetItemIds } = shouldRollbackItems ? await loadTransferAssetItems(transfer) : { assetItemIds: [] as string[] };
      const sourceIsStore = Boolean(transfer.store_id) && String(transfer.store_id) === fromOfficeId;
      const sourceHolderUpdate = sourceIsStore
        ? setAssetItemStoreHolderUpdate(String(transfer.store_id))
        : setAssetItemOfficeHolderUpdate(fromOfficeId);

      await runWithTransaction(session, async (txSession) => {
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

      const transferContext = await resolveTransferNotificationContext(transfer);
      await notifyTransferLifecycle({
        transfer,
        type: 'TRANSFER_CANCELLED',
        title: 'Transfer Cancelled',
        message: `Transfer from ${transferContext.fromLabel} to ${transferContext.toLabel} was cancelled.`,
        excludeUserIds: [access.userId],
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
      await enforceAccessPolicy({
        action: 'transfer.retire',
        actor: toPolicyActor(access, req),
        errorMessage: 'Not permitted to retire transfers',
      });
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




