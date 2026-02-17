import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import mongoose, { Types } from 'mongoose';
import { Response, NextFunction } from 'express';
import type { Express } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { createHttpError } from '../utils/httpError';
import { getRequestContext } from '../utils/scope';
import { OfficeModel } from '../models/office.model';
import { EmployeeModel } from '../models/employee.model';
import { OfficeSubLocationModel } from '../models/officeSubLocation.model';
import { UserModel } from '../models/user.model';
import { AssetModel } from '../models/asset.model';
import { AssetItemModel } from '../models/assetItem.model';
import { AssignmentModel } from '../models/assignment.model';
import { RecordModel } from '../models/record.model';
import { RequisitionModel } from '../models/requisition.model';
import { RequisitionLineModel } from '../models/requisitionLine.model';
import { DocumentModel } from '../models/document.model';
import { DocumentVersionModel } from '../models/documentVersion.model';
import { DocumentLinkModel } from '../models/documentLink.model';
import { createRecord } from '../modules/records/services/record.service';
import { logAudit } from '../modules/records/services/audit.service';
import { ConsumableItemModel } from '../modules/consumables/models/consumableItem.model';
import { ConsumableInventoryBalanceModel } from '../modules/consumables/models/consumableInventoryBalance.model';
import { ConsumableInventoryTransactionModel } from '../modules/consumables/models/consumableInventoryTransaction.model';
import { generateAndStoreIssuanceReport } from '../services/requisitionIssuanceReport.service';
import { createBulkNotifications } from '../services/notification.service';
import { isAssetItemHeldByOffice } from '../utils/assetHolder';
import {
  readParam,
  asNonEmptyString,
  asNullableString,
  parseDateInput,
  parsePositiveInt,
  escapeRegex,
} from '../utils/requestParsing';

const ALLOWED_SUBMITTER_ROLES = new Set(['employee', 'office_head', 'caretaker']);
const DISTRICT_LAB_VERIFIER_ROLES = new Set(['office_head']);
const HQ_DIRECTORATE_VERIFIER_ROLES = new Set(['office_head', 'caretaker']);
const DISTRICT_LAB_FULFILLER_ROLES = new Set(['office_head']);
const HQ_DIRECTORATE_FULFILLER_ROLES = new Set(['office_head', 'caretaker']);
const LINE_TYPES = new Set(['MOVEABLE', 'CONSUMABLE']);
const TARGET_TYPES = new Set(['EMPLOYEE', 'SUB_LOCATION']);
const VERIFY_DECISIONS = new Set(['VERIFY', 'REJECT']);
const FULFILL_ALLOWED_STATUSES = new Set(['VERIFIED_APPROVED', 'IN_FULFILLMENT']);
const ADJUST_ALLOWED_STATUSES = new Set(['FULFILLED', 'FULFILLED_PENDING_SIGNATURE']);
const OPEN_ASSIGNMENT_STATUSES = new Set(['DRAFT', 'ISSUED', 'RETURN_REQUESTED']);

type AuthRequestWithFiles = AuthRequest & {
  files?:
    | Express.Multer.File[]
    | {
        [fieldname: string]: Express.Multer.File[];
      };
};

type ParsedLine = {
  line_type: 'MOVEABLE' | 'CONSUMABLE';
  asset_id: string | null;
  consumable_id: string | null;
  requested_name: string;
  mapped_name: string | null;
  mapped_by_user_id: string | null;
  mapped_at: Date | null;
  requested_quantity: number;
  approved_quantity: number;
  fulfilled_quantity: number;
  status: 'PENDING_ASSIGNMENT';
  notes: string | null;
};

function asPositiveNumber(value: unknown, fallback: number, fieldName: string) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw createHttpError(400, `${fieldName} must be greater than 0`);
  }
  return parsed;
}

function asNonNegativeNumber(value: unknown, fallback: number, fieldName: string) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw createHttpError(400, `${fieldName} must be 0 or greater`);
  }
  return parsed;
}

function parseLinesInput(linesInput: unknown): ParsedLine[] {
  let parsed: unknown = linesInput;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      throw createHttpError(400, 'lines must be valid JSON');
    }
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw createHttpError(400, 'lines must be a non-empty array');
  }

  return parsed.map((line, index) => {
    if (!line || typeof line !== 'object') {
      throw createHttpError(400, `lines[${index}] must be an object`);
    }
    const lineObj = line as Record<string, unknown>;
    const rawType = String(lineObj.line_type ?? '').trim().toUpperCase();
    if (!LINE_TYPES.has(rawType)) {
      throw createHttpError(400, `lines[${index}].line_type must be MOVEABLE or CONSUMABLE`);
    }

    const requestedName = asNonEmptyString(lineObj.requested_name, `lines[${index}].requested_name`);

    let assetId: string | null = null;
    let consumableId: string | null = null;
    if (rawType === 'MOVEABLE') {
      if (asNullableString(lineObj.consumable_id)) {
        throw createHttpError(400, `lines[${index}].consumable_id is not allowed for MOVEABLE lines`);
      }
      const rawAssetId = asNullableString(lineObj.asset_id);
      if (rawAssetId) {
        if (!Types.ObjectId.isValid(rawAssetId)) {
          throw createHttpError(400, `lines[${index}].asset_id is invalid`);
        }
        assetId = rawAssetId;
      }
    } else {
      if (asNullableString(lineObj.asset_id)) {
        throw createHttpError(400, `lines[${index}].asset_id is not allowed for CONSUMABLE lines`);
      }
      const rawConsumableId = asNullableString(lineObj.consumable_id);
      if (rawConsumableId) {
        if (!Types.ObjectId.isValid(rawConsumableId)) {
          throw createHttpError(400, `lines[${index}].consumable_id is invalid`);
        }
        consumableId = rawConsumableId;
      }
    }

    if (lineObj.requested_quantity === undefined || lineObj.requested_quantity === null || lineObj.requested_quantity === '') {
      throw createHttpError(400, `lines[${index}].requested_quantity is required`);
    }
    const requestedQty = asPositiveNumber(lineObj.requested_quantity, 1, `lines[${index}].requested_quantity`);
    const approvedQty = asNonNegativeNumber(
      lineObj.approved_quantity,
      requestedQty,
      `lines[${index}].approved_quantity`
    );
    const notes = asNullableString(lineObj.notes);

    return {
      line_type: rawType as 'MOVEABLE' | 'CONSUMABLE',
      asset_id: assetId,
      consumable_id: consumableId,
      requested_name: requestedName,
      mapped_name: null,
      mapped_by_user_id: null,
      mapped_at: null,
      requested_quantity: requestedQty,
      approved_quantity: approvedQty,
      fulfilled_quantity: 0,
      status: 'PENDING_ASSIGNMENT',
      notes,
    };
  });
}

async function isHqDirectorateOffice(officeId: string) {
  const office: any = await OfficeModel.findById(officeId, {
    type: 1,
    parent_office_id: 1,
  }).lean();
  if (!office) throw createHttpError(404, 'Office not found');
  if (office.type === 'HEAD_OFFICE' || office.type === 'DIRECTORATE') return true;
  const parentOfficeId = office.parent_office_id;
  if (!parentOfficeId) return false;
  const parent: any = await OfficeModel.findById(parentOfficeId, { type: 1 }).lean();
  return parent?.type === 'HEAD_OFFICE' || parent?.type === 'DIRECTORATE';
}

function parseVerifyDecision(raw: unknown) {
  const parsed = String(raw ?? '').trim().toUpperCase();
  if (!VERIFY_DECISIONS.has(parsed)) {
    throw createHttpError(400, "decision must be 'VERIFY' or 'REJECT'");
  }
  return parsed as 'VERIFY' | 'REJECT';
}

function getSignedIssuanceFile(req: AuthRequestWithFiles) {
  if (req.file) return req.file;
  if (Array.isArray(req.files)) {
    return req.files[0];
  }
  if (req.files && typeof req.files === 'object') {
    const asMap = req.files as Record<string, Express.Multer.File[]>;
    return asMap.signedIssuanceFile?.[0] || asMap.file?.[0] || null;
  }
  return null;
}

type FulfillLineInput = {
  lineId: string;
  assignedAssetItemIds: string[];
  issuedQuantity: number | null;
};

function parseFulfillLinesInput(raw: unknown) {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { lines?: unknown }).lines)) {
    throw createHttpError(400, 'lines must be an array');
  }
  const rows = (raw as { lines: unknown[] }).lines;
  if (rows.length === 0) {
    throw createHttpError(400, 'lines must be a non-empty array');
  }

  const seen = new Set<string>();
  return rows.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw createHttpError(400, `lines[${index}] must be an object`);
    }
    const lineObj = entry as Record<string, unknown>;
    const lineId = asNonEmptyString(lineObj.lineId, `lines[${index}].lineId`);
    if (!Types.ObjectId.isValid(lineId)) {
      throw createHttpError(400, `lines[${index}].lineId is invalid`);
    }
    if (seen.has(lineId)) {
      throw createHttpError(400, `Duplicate lineId in payload: ${lineId}`);
    }
    seen.add(lineId);

    const rawAssetIds = lineObj.assignedAssetItemIds;
    const assignedAssetItemIds = Array.isArray(rawAssetIds)
      ? rawAssetIds.map((id, idIndex) => {
          const parsed = asNonEmptyString(id, `lines[${index}].assignedAssetItemIds[${idIndex}]`);
          if (!Types.ObjectId.isValid(parsed)) {
            throw createHttpError(400, `lines[${index}].assignedAssetItemIds[${idIndex}] is invalid`);
          }
          return parsed;
        })
      : [];

    let issuedQuantity: number | null = null;
    if (lineObj.issuedQuantity !== undefined && lineObj.issuedQuantity !== null && lineObj.issuedQuantity !== '') {
      const parsedQty = Number(lineObj.issuedQuantity);
      if (!Number.isFinite(parsedQty) || parsedQty < 0) {
        throw createHttpError(400, `lines[${index}].issuedQuantity must be 0 or greater`);
      }
      issuedQuantity = parsedQty;
    }

    return {
      lineId,
      assignedAssetItemIds,
      issuedQuantity,
    } satisfies FulfillLineInput;
  });
}

function parseAdjustRequest(raw: unknown) {
  if (!raw || typeof raw !== 'object') {
    throw createHttpError(400, 'Request body is required');
  }
  const body = raw as Record<string, unknown>;
  const reason = asNonEmptyString(body.reason, 'reason');

  let adjustments: unknown = body.adjustments;
  if (typeof adjustments === 'string') {
    try {
      adjustments = JSON.parse(adjustments);
    } catch {
      throw createHttpError(400, 'adjustments must be valid JSON array');
    }
  }
  if (!Array.isArray(adjustments) || adjustments.length === 0) {
    throw createHttpError(400, 'adjustments must be a non-empty array');
  }

  return {
    reason,
    adjustments,
  };
}

function summarizeAdjustmentsForNotes(adjustments: unknown[]) {
  const safe = JSON.stringify(adjustments);
  if (!safe) return '[]';
  if (safe.length <= 1000) return safe;
  return `${safe.slice(0, 997)}...`;
}

function getRemainingQuantity(line: {
  requested_quantity?: number | null;
  approved_quantity?: number | null;
  fulfilled_quantity?: number | null;
}) {
  const approved =
    line.approved_quantity === null || line.approved_quantity === undefined
      ? Number(line.requested_quantity || 0)
      : Number(line.approved_quantity || 0);
  const fulfilled = Number(line.fulfilled_quantity || 0);
  return Math.max(approved - fulfilled, 0);
}

function toObjectIdString(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Types.ObjectId) return value.toString();
  return String(value);
}

function normalizeLineType(value: unknown): 'MOVEABLE' | 'CONSUMABLE' | 'UNKNOWN' {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'MOVEABLE') return 'MOVEABLE';
  if (normalized === 'CONSUMABLE') return 'CONSUMABLE';
  return 'UNKNOWN';
}

async function enrichLinesWithMappingMetadata<T extends Record<string, unknown>>(lines: T[]) {
  if (!Array.isArray(lines) || lines.length === 0) return [] as Array<T & Record<string, unknown>>;

  const moveableAssetIds = Array.from(
    new Set(
      lines
        .map((line) => (normalizeLineType(line.line_type) === 'MOVEABLE' ? toObjectIdString(line.asset_id) : null))
        .filter((id): id is string => Boolean(id))
    )
  );
  const consumableIds = Array.from(
    new Set(
      lines
        .map((line) =>
          normalizeLineType(line.line_type) === 'CONSUMABLE' ? toObjectIdString(line.consumable_id) : null
        )
        .filter((id): id is string => Boolean(id))
    )
  );

  const [assets, consumables] = await Promise.all([
    moveableAssetIds.length
      ? AssetModel.find({ _id: { $in: moveableAssetIds } }, { _id: 1, name: 1 }).lean()
      : Promise.resolve([]),
    consumableIds.length
      ? ConsumableItemModel.find({ _id: { $in: consumableIds } }, { _id: 1, name: 1 }).lean()
      : Promise.resolve([]),
  ]);

  const assetNameById = new Map(assets.map((asset) => [String(asset._id), String(asset.name || '')]));
  const consumableNameById = new Map(consumables.map((item) => [String(item._id), String(item.name || '')]));

  return lines.map((line) => {
    const normalizedType = normalizeLineType(line.line_type);
    const mappedNameField = asNullableString(line.mapped_name);

    if (normalizedType === 'MOVEABLE') {
      const assetId = toObjectIdString(line.asset_id);
      const isMapped = Boolean(assetId);
      const mappedName = mappedNameField || (assetId ? assetNameById.get(assetId) || null : null);
      return {
        ...line,
        mapped_name: mappedName,
        is_mapped: isMapped,
        mapping_type: 'MOVEABLE' as const,
        mapping_missing_reason: isMapped ? null : 'NOT_MAPPED_TO_ASSET',
      };
    }

    if (normalizedType === 'CONSUMABLE') {
      const consumableId = toObjectIdString(line.consumable_id);
      const isMapped = Boolean(consumableId);
      const mappedName = mappedNameField || (consumableId ? consumableNameById.get(consumableId) || null : null);
      return {
        ...line,
        mapped_name: mappedName,
        is_mapped: isMapped,
        mapping_type: 'CONSUMABLE' as const,
        mapping_missing_reason: isMapped ? null : 'NOT_MAPPED_TO_CONSUMABLE',
      };
    }

    return {
      ...line,
      mapped_name: mappedNameField,
      is_mapped: false,
      mapping_type: null,
      mapping_missing_reason: 'UNKNOWN_LINE_TYPE',
    };
  });
}

function buildRequisitionMappingSummary(lines: Array<Record<string, unknown>>) {
  const unmappedLinesCount = lines.reduce((count, line) => {
    return count + (line.is_mapped === false ? 1 : 0);
  }, 0);
  return {
    has_unmapped_lines: unmappedLinesCount > 0,
    unmapped_lines_count: unmappedLinesCount,
  };
}

async function dispatchDraftAssignmentNotifications(input: {
  officeId: string;
  requisition: any;
  assignmentIds: string[];
}) {
  if (!input.officeId || input.assignmentIds.length === 0) return;

  const managers = await UserModel.find(
    {
      location_id: input.officeId,
      role: { $in: ['office_head', 'caretaker'] },
      is_active: true,
    },
    { _id: 1 }
  )
    .lean()
    .exec();

  const recipientIds = new Set(managers.map((user) => String(user._id)));
  if (String(input.requisition?.target_type || '') === 'EMPLOYEE' && input.requisition?.target_id) {
    const targetEmployee: any = await EmployeeModel.findById(input.requisition.target_id, { user_id: 1 }).lean();
    const targetUserId = targetEmployee?.user_id ? String(targetEmployee.user_id) : null;
    if (targetUserId && Types.ObjectId.isValid(targetUserId)) {
      recipientIds.add(targetUserId);
    }
  }

  const recipients = Array.from(recipientIds);
  if (recipients.length === 0) return;

  const fileNumber = String(input.requisition?.file_number || '').trim();
  const message = fileNumber
    ? `Draft assignments created for requisition ${fileNumber}. Print slips.`
    : 'Draft assignments created. Print slips.';

  const payload = recipients.flatMap((recipientUserId) =>
    input.assignmentIds.map((assignmentId) => ({
      recipientUserId,
      officeId: input.officeId,
      type: 'ASSIGNMENT_DRAFT_CREATED',
      title: 'Draft Assignments Created',
      message,
      entityType: 'Assignment',
      entityId: assignmentId,
    }))
  );

  await createBulkNotifications(payload);
}

export {
  ALLOWED_SUBMITTER_ROLES,
  DISTRICT_LAB_VERIFIER_ROLES,
  HQ_DIRECTORATE_VERIFIER_ROLES,
  DISTRICT_LAB_FULFILLER_ROLES,
  HQ_DIRECTORATE_FULFILLER_ROLES,
  LINE_TYPES,
  TARGET_TYPES,
  VERIFY_DECISIONS,
  FULFILL_ALLOWED_STATUSES,
  ADJUST_ALLOWED_STATUSES,
  OPEN_ASSIGNMENT_STATUSES,
  AuthRequestWithFiles,
  ParsedLine,
  readParam,
  asNonEmptyString,
  asNullableString,
  asPositiveNumber,
  asNonNegativeNumber,
  parseLinesInput,
  isHqDirectorateOffice,
  parseVerifyDecision,
  getSignedIssuanceFile,
  FulfillLineInput,
  parseFulfillLinesInput,
  parseAdjustRequest,
  summarizeAdjustmentsForNotes,
  parseDateInput,
  parsePositiveInt,
  escapeRegex,
  getRemainingQuantity,
  toObjectIdString,
  normalizeLineType,
  enrichLinesWithMappingMetadata,
  buildRequisitionMappingSummary,
  dispatchDraftAssignmentNotifications,
};
