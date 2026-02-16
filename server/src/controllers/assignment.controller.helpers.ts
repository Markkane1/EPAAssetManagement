import fs from 'fs/promises';
import path from 'path';
import type { Express, NextFunction, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import type { AuthRequest } from '../middleware/auth';
import { AssignmentModel } from '../models/assignment.model';
import { AssetItemModel } from '../models/assetItem.model';
import { EmployeeModel } from '../models/employee.model';
import { RequisitionModel } from '../models/requisition.model';
import { RequisitionLineModel } from '../models/requisitionLine.model';
import { DocumentVersionModel } from '../models/documentVersion.model';
import { UserModel } from '../models/user.model';
import { mapFields } from '../utils/mapFields';
import { resolveAccessContext, ensureOfficeScope, isOfficeManager } from '../utils/accessControl';
import { createHttpError } from '../utils/httpError';
import { createRecord } from '../modules/records/services/record.service';
import { uploadDocumentVersion } from '../modules/records/services/document.service';
import { logAudit } from '../modules/records/services/audit.service';
import { getAssetItemOfficeId, officeAssetItemFilter } from '../utils/assetHolder';
import { createBulkNotifications } from '../services/notification.service';
import { generateHandoverSlip, generateReturnSlip } from '../services/assignmentSlip.service';
import { readParam, clampInt, asNonEmptyString, asNullableString } from '../utils/requestParsing';

const OPEN_ASSIGNMENT_STATUSES = ['DRAFT', 'ISSUED', 'RETURN_REQUESTED'] as const;
const RETURN_SLIP_ALLOWED_STATUSES = new Set(['ISSUED', 'RETURN_REQUESTED']);
const ASSIGNED_TO_TYPES = new Set(['EMPLOYEE', 'SUB_LOCATION']);

const fieldMap = {
  assetItemId: 'asset_item_id',
  employeeId: 'employee_id',
  assignedDate: 'assigned_date',
  expectedReturnDate: 'expected_return_date',
  returnedDate: 'returned_date',
  isActive: 'is_active',
};

type AuthRequestWithFiles = AuthRequest & {
  file?: Express.Multer.File;
  files?:
    | Express.Multer.File[]
    | {
        [fieldname: string]: Express.Multer.File[];
      };
};

type AccessContext = {
  userId: string;
  role: string;
  officeId: string | null;
  isOrgAdmin: boolean;
};

function ensureObjectId(value: string, fieldName: string) {
  if (!Types.ObjectId.isValid(value)) {
    throw createHttpError(400, `${fieldName} is invalid`);
  }
}

function toIdString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Types.ObjectId) return value.toString();
  if (typeof value === 'object') {
    const raw = value as { _id?: unknown; id?: unknown; toHexString?: () => string; toString?: () => string };
    if (typeof raw.toHexString === 'function') return raw.toHexString();
    if (raw._id !== undefined && raw._id !== value) return toIdString(raw._id);
    if (raw.id !== undefined && raw.id !== value) return toIdString(raw.id);
    if (typeof raw.toString === 'function') {
      const parsed = raw.toString();
      if (parsed && parsed !== '[object Object]') return parsed;
    }
  }
  return null;
}

function buildPayload(body: Record<string, unknown>) {
  const payload = mapFields(body, fieldMap);
  Object.values(fieldMap).forEach((dbKey) => {
    if (body[dbKey] !== undefined) {
      payload[dbKey] = body[dbKey];
    }
  });
  if (body.notes !== undefined) payload.notes = body.notes;
  if (payload.assigned_date) payload.assigned_date = new Date(String(payload.assigned_date));
  if (payload.expected_return_date) payload.expected_return_date = new Date(String(payload.expected_return_date));
  if (payload.returned_date) payload.returned_date = new Date(String(payload.returned_date));
  return payload;
}

function requireAssetItemOfficeId(item: { holder_type?: string | null; holder_id?: unknown; location_id?: unknown }, message: string) {
  const officeId = getAssetItemOfficeId(item);
  if (!officeId) {
    throw createHttpError(400, message);
  }
  return officeId;
}

function toRequestContext(access: AccessContext) {
  return {
    userId: access.userId,
    role: access.role,
    locationId: access.officeId,
    isOrgAdmin: access.isOrgAdmin,
  };
}

function resolveStoredFileAbsolutePath(storedPath: string) {
  const normalized = storedPath.replace(/\\/g, '/');
  const absolutePath = path.resolve(process.cwd(), normalized);
  const uploadsRoot = path.resolve(process.cwd(), 'uploads');
  if (!absolutePath.startsWith(uploadsRoot)) {
    throw createHttpError(400, 'Invalid file path');
  }
  return absolutePath;
}

function getUploadedFile(req: AuthRequestWithFiles, preferredFields: string[]) {
  if (req.file && preferredFields.includes(req.file.fieldname)) return req.file;
  if (Array.isArray(req.files)) {
    for (const file of req.files) {
      if (preferredFields.includes(file.fieldname)) return file;
    }
    return null;
  }
  if (req.files && typeof req.files === 'object') {
    const mapped = req.files as Record<string, Express.Multer.File[]>;
    for (const field of preferredFields) {
      if (mapped[field]?.[0]) return mapped[field][0];
    }
  }
  return null;
}

async function ensureAssignmentAssetScope(access: AccessContext, assignment: any) {
  const assetItemId = toIdString(assignment.asset_item_id);
  if (!assetItemId) {
    throw createHttpError(400, 'Assignment asset item is missing');
  }
  const assetItem: any = await AssetItemModel.findById(assetItemId);
  if (!assetItem) {
    throw createHttpError(404, 'Asset item not found');
  }
  const officeId = requireAssetItemOfficeId(assetItem, 'Assigned items must be held by an office');
  if (!access.isOrgAdmin) {
    ensureOfficeScope(access, officeId);
  }
  return { assetItem, officeId };
}

async function resolveNotificationOfficeId(assignment: { requisition_id?: unknown }, fallbackOfficeId: string) {
  const requisitionId = toIdString(assignment.requisition_id);
  if (!requisitionId) return fallbackOfficeId;
  const requisition: any = await RequisitionModel.findById(requisitionId, { office_id: 1 }).lean();
  const officeId = requisition?.office_id ? String(requisition.office_id) : null;
  return officeId || fallbackOfficeId;
}

async function resolveNotificationRecipients(officeId: string, assignment: { assigned_to_type?: unknown; assigned_to_id?: unknown }) {
  const managers = await UserModel.find(
    {
      location_id: officeId,
      role: { $in: ['office_head', 'caretaker'] },
      is_active: true,
    },
    { _id: 1 }
  )
    .lean()
    .exec();

  const recipientIds = new Set<string>(managers.map((user) => String(user._id)));
  if (String(assignment.assigned_to_type || '') === 'EMPLOYEE' && assignment.assigned_to_id) {
    const employee: any = await EmployeeModel.findById(assignment.assigned_to_id, { user_id: 1 }).lean().exec();
    const userId = employee?.user_id ? String(employee.user_id) : null;
    if (userId && Types.ObjectId.isValid(userId)) {
      recipientIds.add(userId);
    }
  }
  return Array.from(recipientIds);
}

async function notifyAssignmentEvent(input: {
  assignment: {
    _id?: unknown;
    assigned_to_type?: unknown;
    assigned_to_id?: unknown;
    requisition_id?: unknown;
  };
  officeId: string;
  type:
    | 'ASSIGNMENT_DRAFT_CREATED'
    | 'HANDOVER_SLIP_READY'
    | 'ASSIGNMENT_ISSUED'
    | 'RETURN_REQUESTED'
    | 'RETURN_SLIP_READY'
    | 'ASSIGNMENT_RETURNED';
  title: string;
  message: string;
}) {
  const assignmentId = toIdString(input.assignment._id);
  if (!assignmentId) return [];
  const officeId = await resolveNotificationOfficeId(input.assignment, input.officeId);
  const recipients = await resolveNotificationRecipients(officeId, input.assignment);
  if (recipients.length === 0) return [];

  return createBulkNotifications(
    recipients.map((recipientUserId) => ({
      recipientUserId,
      officeId,
      type: input.type,
      title: input.title,
      message: input.message,
      entityType: 'Assignment',
      entityId: assignmentId,
    }))
  );
}

async function resolveGeneratedSlipFile(params: {
  assignmentId: string;
  generatedByUserId: string;
  kind: 'handover' | 'return';
}) {
  const assignment: any = await AssignmentModel.findById(params.assignmentId, {
    handover_slip_generated_version_id: 1,
    return_slip_generated_version_id: 1,
  }).lean();
  if (!assignment) {
    throw createHttpError(404, 'Assignment not found');
  }

  const generatedVersionId =
    params.kind === 'handover'
      ? toIdString(assignment.handover_slip_generated_version_id)
      : toIdString(assignment.return_slip_generated_version_id);

  if (generatedVersionId) {
    const version: any = await DocumentVersionModel.findById(generatedVersionId, {
      file_path: 1,
      storage_key: 1,
    }).lean();
    const stored = version ? String(version.file_path || version.storage_key || '') : '';
    if (stored) {
      return {
        filePath: stored.replace(/\\/g, '/'),
      };
    }
  }

  const generated =
    params.kind === 'handover'
      ? await generateHandoverSlip({
          assignmentId: params.assignmentId,
          generatedByUserId: params.generatedByUserId,
        })
      : await generateReturnSlip({
          assignmentId: params.assignmentId,
          generatedByUserId: params.generatedByUserId,
        });

  return {
    filePath: generated.filePath,
  };
}

export {
  OPEN_ASSIGNMENT_STATUSES,
  RETURN_SLIP_ALLOWED_STATUSES,
  ASSIGNED_TO_TYPES,
  fieldMap,
  AuthRequestWithFiles,
  AccessContext,
  readParam,
  clampInt,
  asNonEmptyString,
  asNullableString,
  ensureObjectId,
  toIdString,
  buildPayload,
  requireAssetItemOfficeId,
  toRequestContext,
  resolveStoredFileAbsolutePath,
  getUploadedFile,
  ensureAssignmentAssetScope,
  resolveNotificationOfficeId,
  resolveNotificationRecipients,
  notifyAssignmentEvent,
  resolveGeneratedSlipFile,
};
