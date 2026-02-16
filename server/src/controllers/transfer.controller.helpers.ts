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
import { readParam, clampInt } from '../utils/requestParsing';

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
  return Array.isArray(transfer.lines)
    ? transfer.lines
        .map((line: any) => (line?.asset_item_id ? String(line.asset_item_id) : null))
        .filter((id: string | null): id is string => Boolean(id))
    : [];
}

function ensureTransferLines(transfer: any) {
  if (!Array.isArray(transfer.lines)) {
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

export {
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
};
