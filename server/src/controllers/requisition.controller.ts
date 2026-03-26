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
import { generateHandoverSlip } from '../services/assignmentSlip.service';
import { createBulkNotifications } from '../services/notification.service';
import { isAssetItemHeldByOffice } from '../utils/assetHolder';
import { assertUploadedFileIntegrity } from '../utils/uploadValidation';
import { buildUserRoleMatchFilter } from '../utils/roles';
import {
  hasPermissionAction,
  loadStoredRolePermissionsContext,
  resolveStoredRolePageActions,
  resolveStoredRolePermissionEntry,
  type PermissionAction,
} from '../utils/rolePermissions';

import {
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
  enrichLinesWithMappingMetadata,
  buildRequisitionMappingSummary,
} from './requisition.controller.helpers';

const LEGACY_REQUISITION_VIEWER_ROLES = new Set(['org_admin', 'office_head', 'caretaker', 'employee']);
const LEGACY_REQUISITION_MANAGER_ROLES = new Set(['office_head', 'caretaker']);
const SUBMITTED_STATUSES = new Set(['SUBMITTED', 'PENDING_VERIFICATION']);
const CARETAKER_PENDING_FULFILLMENT_STATUSES = new Set([
  'APPROVED',
  'VERIFIED_APPROVED',
  'IN_FULFILLMENT',
  'PARTIALLY_FULFILLED',
]);
const CARETAKER_FULFILLED_HISTORY_STATUSES = new Set(['FULFILLED', 'FULFILLED_PENDING_SIGNATURE']);

function hasMutatingPermission(actions: PermissionAction[]) {
  return (
    hasPermissionAction(actions, 'create') ||
    hasPermissionAction(actions, 'edit') ||
    hasPermissionAction(actions, 'delete')
  );
}

async function resolveRequisitionPermissionFlags(role: string) {
  const permissionContext = await loadStoredRolePermissionsContext();
  const roleEntry = resolveStoredRolePermissionEntry(permissionContext, role);
  const requisitionsActions = resolveStoredRolePageActions(permissionContext, role, 'requisitions');
  const requisitionsNewActions = resolveStoredRolePageActions(permissionContext, role, 'requisitions-new');

  return {
    hasStoredRoleEntry: Boolean(roleEntry),
    canViewRequisitions: hasPermissionAction(requisitionsActions, 'view'),
    canManageRequisitions: hasMutatingPermission(requisitionsActions),
    canSubmitRequisitions: hasMutatingPermission(requisitionsNewActions),
  };
}

function uniqueObjectIdStrings(ids: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      ids
        .map((id) => String(id || '').trim())
        .filter((id) => Types.ObjectId.isValid(id))
    )
  );
}

async function resolveActiveUserIdsByOfficeAndRoles(officeId: string, roles: string[]) {
  if (!Types.ObjectId.isValid(officeId) || roles.length === 0) return [] as string[];
  const users = await UserModel.find(
    {
      is_active: true,
      location_id: officeId,
      ...buildUserRoleMatchFilter(roles),
    },
    { _id: 1 }
  )
    .lean()
    .exec();
  return users.map((user) => String(user._id));
}

async function resolveActiveOrgAdminUserIds() {
  const users = await UserModel.find(
    {
      is_active: true,
      ...buildUserRoleMatchFilter(['org_admin']),
    },
    { _id: 1 }
  )
    .lean()
    .exec();
  return users.map((user) => String(user._id));
}

async function dispatchRequisitionNotifications(input: {
  officeId: string;
  requisitionId: string;
  type:
    | 'REQUISITION_SUBMITTED'
    | 'REQUISITION_APPROVED'
    | 'REQUISITION_REJECTED'
    | 'REQUISITION_FULFILLED'
    | 'REQUISITION_STATUS_CHANGED'
    | 'REQUISITION_ADJUSTED'
    | 'REQUISITION_LINE_MAPPED'
    | 'REQUISITION_ISSUANCE_SIGNED';
  title: string;
  message: string;
  recipientUserIds: Array<string | null | undefined>;
}) {
  const recipients = uniqueObjectIdStrings(input.recipientUserIds);
  if (recipients.length === 0) return;
  await createBulkNotifications(
    recipients.map((recipientUserId) => ({
      recipientUserId,
      officeId: input.officeId,
      type: input.type,
      title: input.title,
      message: input.message,
      entityType: 'Requisition',
      entityId: input.requisitionId,
    }))
  );
}

async function loadRequisitionLinkedDocuments(requisitionId: unknown) {
  const documents = await DocumentLinkModel.aggregate<{
    _id: unknown;
    title?: string;
    doc_type?: string;
    status?: string;
    created_at?: Date | string;
    latestVersion?: {
      version_no?: number;
      file_name?: string;
      mime_type?: string;
      size_bytes?: number;
      uploaded_at?: Date | string;
      file_url?: string;
    } | null;
  }>([
    {
      $match: {
        entity_type: 'Requisition',
        entity_id: requisitionId,
      },
    },
    {
      $lookup: {
        from: DocumentModel.collection.name,
        localField: 'document_id',
        foreignField: '_id',
        as: 'document',
      },
    },
    {
      $set: {
        document: { $ifNull: [{ $arrayElemAt: ['$document', 0] }, null] },
      },
    },
    {
      $match: {
        'document.doc_type': { $in: ['RequisitionForm', 'IssueSlip'] },
      },
    },
    {
      $lookup: {
        from: DocumentVersionModel.collection.name,
        let: { documentId: '$document_id' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$document_id', '$$documentId'] },
            },
          },
          { $sort: { version_no: -1 } },
          { $limit: 1 },
          {
            $project: {
              _id: 1,
              version_no: 1,
              file_name: 1,
              mime_type: 1,
              size_bytes: 1,
              uploaded_at: 1,
              file_url: 1,
            },
          },
        ],
        as: 'latestVersion',
      },
    },
    {
      $set: {
        latestVersion: { $ifNull: [{ $arrayElemAt: ['$latestVersion', 0] }, null] },
      },
    },
    { $sort: { 'document.created_at': -1 } },
    {
      $project: {
        _id: '$document._id',
        title: '$document.title',
        doc_type: '$document.doc_type',
        status: '$document.status',
        created_at: '$document.created_at',
        latestVersion: 1,
      },
    },
  ]).exec();

  const requisitionForm =
    documents.find((doc) => String(doc.doc_type || '') === 'RequisitionForm') || null;
  const issueSlip =
    documents.find(
      (doc) =>
        String(doc.doc_type || '') === 'IssueSlip' &&
        (String(doc.status || '') === 'Draft' || String(doc.status || '') === 'Final')
    ) || null;

  return {
    requisitionForm,
    issueSlip,
  };
}

export const requisitionController = {
  list: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      const permissionFlags = await resolveRequisitionPermissionFlags(ctx.role);
      if (!ctx.isOrgAdmin) {
        if (permissionFlags.hasStoredRoleEntry) {
          if (!permissionFlags.canViewRequisitions) {
            throw createHttpError(403, 'Not permitted to view requisitions');
          }
        } else if (!LEGACY_REQUISITION_VIEWER_ROLES.has(ctx.role)) {
          throw createHttpError(403, 'Not permitted to view requisitions');
        }
      }
      const canViewAll = ctx.isOrgAdmin;
      const page = parsePositiveInt(req.query.page, 1, 100_000);
      const limit = parsePositiveInt(req.query.limit, 50, 200);
      const skip = (page - 1) * limit;
      const status = asNullableString(req.query.status)?.toUpperCase() || null;
      const queue = asNullableString(req.query.queue)?.toLowerCase() || null;
      const fileNumber = asNullableString(req.query.fileNumber);
      const officeId = asNullableString(req.query.officeId);
      const from = parseDateInput(req.query.from, 'from');
      const to = parseDateInput(req.query.to, 'to');

      if (officeId && !Types.ObjectId.isValid(officeId)) {
        throw createHttpError(400, 'officeId is invalid');
      }
      if (from && to && from.getTime() > to.getTime()) {
        throw createHttpError(400, 'from must be earlier than or equal to to');
      }

      const filter: Record<string, unknown> = {};
      let roleScopedStatusFilter: unknown = null;
      if (!canViewAll) {
        if (!ctx.locationId) throw createHttpError(403, 'User is not assigned to an office');
        if (officeId && officeId !== ctx.locationId) {
          throw createHttpError(403, 'Access restricted to assigned office');
        }
        filter.office_id = ctx.locationId;
        if (ctx.role === 'employee') {
          filter.submitted_by_user_id = ctx.userId;
        } else if (ctx.role === 'office_head') {
          if (status && !SUBMITTED_STATUSES.has(status)) {
            throw createHttpError(403, 'Office head can only view submitted requisitions');
          }
          roleScopedStatusFilter = { $in: Array.from(SUBMITTED_STATUSES) };
        } else if (ctx.role === 'caretaker') {
          if (status && SUBMITTED_STATUSES.has(status)) {
            throw createHttpError(403, 'Caretaker cannot view submitted requisitions');
          }
          if (queue === 'approved') {
            roleScopedStatusFilter = { $in: Array.from(CARETAKER_PENDING_FULFILLMENT_STATUSES) };
          } else if (queue === 'fulfilled') {
            roleScopedStatusFilter = { $in: Array.from(CARETAKER_FULFILLED_HISTORY_STATUSES) };
          } else {
            roleScopedStatusFilter = { $nin: Array.from(SUBMITTED_STATUSES) };
          }
        }
      } else if (officeId) {
        filter.office_id = officeId;
      }

      const queueScopedStatusFilter =
        queue === 'approved'
          ? { $in: Array.from(CARETAKER_PENDING_FULFILLMENT_STATUSES) }
          : queue === 'fulfilled'
            ? { $in: Array.from(CARETAKER_FULFILLED_HISTORY_STATUSES) }
            : null;

      if (status) {
        filter.status = status;
      } else if (roleScopedStatusFilter) {
        filter.status = roleScopedStatusFilter;
      } else if (queueScopedStatusFilter) {
        filter.status = queueScopedStatusFilter;
      }
      if (fileNumber) filter.file_number = { $regex: escapeRegex(fileNumber), $options: 'i' };
      if (from || to) {
        const createdAt: Record<string, Date> = {};
        if (from) createdAt.$gte = from;
        if (to) createdAt.$lte = to;
        filter.created_at = createdAt;
      }

      const [data, total] = await Promise.all([
        RequisitionModel.find(filter).sort({ created_at: -1 }).skip(skip).limit(limit).lean(),
        RequisitionModel.countDocuments(filter),
      ]);

      const requisitionIds = data.map((row) => String(row._id)).filter(Boolean);
      const lines = requisitionIds.length
        ? await RequisitionLineModel.find(
            { requisition_id: { $in: requisitionIds } },
            { requisition_id: 1, line_type: 1, asset_id: 1, consumable_id: 1, mapped_name: 1 }
          ).lean()
        : [];
      const enrichedLines = await enrichLinesWithMappingMetadata(lines as Array<Record<string, unknown>>);
      const summaryByReqId = new Map<string, { has_unmapped_lines: boolean; unmapped_lines_count: number }>();
      for (const line of enrichedLines) {
        const reqId = toObjectIdString(line.requisition_id);
        if (!reqId) continue;
        const current =
          summaryByReqId.get(reqId) || { has_unmapped_lines: false, unmapped_lines_count: 0 };
        if (line.is_mapped === false) {
          current.has_unmapped_lines = true;
          current.unmapped_lines_count += 1;
        }
        summaryByReqId.set(reqId, current);
      }
      const enrichedData = data.map((row) => {
        const rowId = String(row._id);
        const summary = summaryByReqId.get(rowId) || {
          has_unmapped_lines: false,
          unmapped_lines_count: 0,
        };
        return {
          ...row,
          ...summary,
        };
      });

      return res.json({
        data: enrichedData,
        page,
        limit,
        total,
      });
    } catch (error) {
      return next(error);
    }
  },
  getById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      const permissionFlags = await resolveRequisitionPermissionFlags(ctx.role);
      if (!ctx.isOrgAdmin) {
        if (permissionFlags.hasStoredRoleEntry) {
          if (!permissionFlags.canViewRequisitions) {
            throw createHttpError(403, 'Not permitted to view requisitions');
          }
        } else if (!LEGACY_REQUISITION_VIEWER_ROLES.has(ctx.role)) {
          throw createHttpError(403, 'Not permitted to view requisitions');
        }
      }
      const canViewAll = ctx.isOrgAdmin;

      const requisition: any = await RequisitionModel.findById(readParam(req, 'id')).lean();
      if (!requisition) {
        throw createHttpError(404, 'Requisition not found');
      }

      const officeId = requisition.office_id ? String(requisition.office_id) : null;
      if (!officeId) {
        throw createHttpError(400, 'Requisition office is missing');
      }
      if (!canViewAll) {
        if (!ctx.locationId) throw createHttpError(403, 'User is not assigned to an office');
        if (ctx.locationId !== officeId) {
          throw createHttpError(403, 'Access restricted to assigned office');
        }
        if (ctx.role === 'employee') {
          const submittedByUserId = requisition.submitted_by_user_id
            ? String(requisition.submitted_by_user_id)
            : null;
          if (!submittedByUserId || submittedByUserId !== ctx.userId) {
            throw createHttpError(403, 'Access restricted to your own requisitions');
          }
        }
        const normalizedStatus = String(requisition.status || '').toUpperCase();
        if (ctx.role === 'office_head' && !SUBMITTED_STATUSES.has(normalizedStatus)) {
          throw createHttpError(403, 'Office head can only access submitted requisitions');
        }
        if (ctx.role === 'caretaker' && SUBMITTED_STATUSES.has(normalizedStatus)) {
          throw createHttpError(403, 'Caretaker cannot access submitted requisitions');
        }
      }

      const [lines, linkedDocuments] = await Promise.all([
        RequisitionLineModel.find({ requisition_id: requisition._id }).sort({ created_at: 1 }).lean(),
        loadRequisitionLinkedDocuments(requisition._id),
      ]);

      const enrichedLines = await enrichLinesWithMappingMetadata(lines as Array<Record<string, unknown>>);
      const mappingSummary = buildRequisitionMappingSummary(enrichedLines as Array<Record<string, unknown>>);

      return res.json({
        requisition: {
          ...requisition,
          ...mappingSummary,
        },
        lines: enrichedLines,
        ...mappingSummary,
        documents: {
          requisitionForm: linkedDocuments.requisitionForm
            ? {
                id: linkedDocuments.requisitionForm._id,
                title: linkedDocuments.requisitionForm.title,
                doc_type: linkedDocuments.requisitionForm.doc_type,
                status: linkedDocuments.requisitionForm.status,
                created_at: linkedDocuments.requisitionForm.created_at,
                latestVersion: linkedDocuments.requisitionForm.latestVersion || null,
              }
            : null,
          issueSlip: linkedDocuments.issueSlip
            ? {
                id: linkedDocuments.issueSlip._id,
                title: linkedDocuments.issueSlip.title,
                doc_type: linkedDocuments.issueSlip.doc_type,
                status: linkedDocuments.issueSlip.status,
                created_at: linkedDocuments.issueSlip.created_at,
                latestVersion: linkedDocuments.issueSlip.latestVersion || null,
              }
            : null,
        },
      });
    } catch (error) {
      return next(error);
    }
  },
  mapLine: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      const permissionFlags = await resolveRequisitionPermissionFlags(ctx.role);
      if (!ctx.isOrgAdmin) {
        const hasLegacyAccess = LEGACY_REQUISITION_MANAGER_ROLES.has(ctx.role);
        const hasDynamicAccess = permissionFlags.hasStoredRoleEntry && permissionFlags.canManageRequisitions;
        if (!hasLegacyAccess && !hasDynamicAccess) {
          throw createHttpError(403, 'Not permitted to map requisition lines');
        }
      }
      if (!Types.ObjectId.isValid(readParam(req, 'id'))) {
        throw createHttpError(400, 'Requisition id is invalid');
      }
      if (!Types.ObjectId.isValid(readParam(req, 'lineId'))) {
        throw createHttpError(400, 'Requisition line id is invalid');
      }

      const requisition: any = await RequisitionModel.findById(readParam(req, 'id')).lean();
      if (!requisition) {
        throw createHttpError(404, 'Requisition not found');
      }

      const officeId = toObjectIdString(requisition.office_id);
      if (!officeId) {
        throw createHttpError(400, 'Requisition office is missing');
      }
      if (!ctx.isOrgAdmin) {
        if (!ctx.locationId) throw createHttpError(403, 'User is not assigned to an office');
        if (ctx.locationId !== officeId) {
          throw createHttpError(403, 'Access restricted to assigned office');
        }
      }

      const line = await RequisitionLineModel.findOne({
        _id: readParam(req, 'lineId'),
        requisition_id: requisition._id,
      });
      if (!line) {
        throw createHttpError(404, 'Requisition line not found');
      }

      const mapType = asNonEmptyString(req.body?.map_type, 'map_type').toUpperCase();
      if (!LINE_TYPES.has(mapType)) {
        throw createHttpError(400, "map_type must be 'MOVEABLE' or 'CONSUMABLE'");
      }
      line.line_type = mapType as 'MOVEABLE' | 'CONSUMABLE';

      if (mapType === 'MOVEABLE') {
        const assetId = asNonEmptyString(req.body?.asset_id, 'asset_id');
        if (!Types.ObjectId.isValid(assetId)) {
          throw createHttpError(400, 'asset_id is invalid');
        }
        const asset: any = await AssetModel.findById(assetId, { _id: 1, name: 1 }).lean();
        if (!asset) {
          throw createHttpError(404, 'Asset not found');
        }
        line.asset_id = asset._id as any;
        line.consumable_id = null;
        line.mapped_name = String(asset.name || line.requested_name || '').trim() || null;
      } else {
        const consumableId = asNonEmptyString(req.body?.consumable_id, 'consumable_id');
        if (!Types.ObjectId.isValid(consumableId)) {
          throw createHttpError(400, 'consumable_id is invalid');
        }
        const consumable: any = await ConsumableItemModel.findById(consumableId, { _id: 1, name: 1 }).lean();
        if (!consumable) {
          throw createHttpError(404, 'Consumable item not found');
        }
        line.consumable_id = consumable._id as any;
        line.asset_id = null;
        line.mapped_name = String(consumable.name || line.requested_name || '').trim() || null;
      }

      line.mapped_by_user_id = ctx.userId as any;
      line.mapped_at = new Date();
      await line.save();

      const allLines: any = await RequisitionLineModel.find({ requisition_id: requisition._id }).lean();
      const enrichedLines = await enrichLinesWithMappingMetadata(allLines as Array<Record<string, unknown>>);
      const mappingSummary = buildRequisitionMappingSummary(enrichedLines as Array<Record<string, unknown>>);
      const lineId = String(line._id);
      const enrichedLine = enrichedLines.find((entry) => String(entry._id) === lineId) || line.toJSON();

      const [officeHeadUserIds, caretakerUserIds, orgAdminUserIds] = await Promise.all([
        resolveActiveUserIdsByOfficeAndRoles(officeId, ['office_head']),
        resolveActiveUserIdsByOfficeAndRoles(officeId, ['caretaker']),
        resolveActiveOrgAdminUserIds(),
      ]);
      await dispatchRequisitionNotifications({
        officeId,
        requisitionId: String(requisition._id),
        type: 'REQUISITION_LINE_MAPPED',
        title: 'Requisition Line Mapped',
        message: `A requisition line was mapped for ${String(requisition.file_number || requisition._id)}.`,
        recipientUserIds: [
          String(requisition.submitted_by_user_id || ''),
          ...officeHeadUserIds,
          ...caretakerUserIds,
          ...orgAdminUserIds,
        ],
      });

      return res.json({
        requisition: {
          ...requisition,
          ...mappingSummary,
        },
        line: enrichedLine,
        ...mappingSummary,
      });
    } catch (error) {
      return next(error);
    }
  },
  create: async (req: AuthRequest, res: Response, next: NextFunction) => {
    let requisitionId: string | null = null;
    let documentId: string | null = null;
    let documentVersionId: string | null = null;
    let documentLinkId: string | null = null;
    try {
      const ctx = await getRequestContext(req);
      const permissionFlags = await resolveRequisitionPermissionFlags(ctx.role);
      const hasDynamicSubmitAccess = permissionFlags.hasStoredRoleEntry && permissionFlags.canSubmitRequisitions;
      if (!ALLOWED_SUBMITTER_ROLES.has(ctx.role) && !hasDynamicSubmitAccess) {
        throw createHttpError(403, 'Not permitted to submit requisitions');
      }
      if (!ctx.locationId) {
        throw createHttpError(403, 'User is not assigned to an office');
      }
      if (!req.file) {
        throw createHttpError(400, 'requisitionFile is required');
      }
      await assertUploadedFileIntegrity(req.file, 'requisitionFile');

      const fileNumber = asNonEmptyString(req.body.fileNumber, 'fileNumber');
      const officeId = asNonEmptyString(req.body.officeId, 'officeId');
      const targetTypeInput = asNonEmptyString(req.body.target_type, 'target_type').toUpperCase();
      if (!TARGET_TYPES.has(targetTypeInput)) {
        throw createHttpError(400, "target_type must be 'EMPLOYEE' or 'SUB_LOCATION'");
      }
      const targetType = targetTypeInput as 'EMPLOYEE' | 'SUB_LOCATION';
      const targetId = asNonEmptyString(req.body.target_id, 'target_id');
      const linkedSubLocationId = asNullableString(req.body.linked_sub_location_id);
      const remarks = asNullableString(req.body.remarks);
      const lines = parseLinesInput(req.body.lines);

      if (!Types.ObjectId.isValid(officeId)) {
        throw createHttpError(400, 'officeId is invalid');
      }
      if (!Types.ObjectId.isValid(targetId)) {
        throw createHttpError(400, 'target_id is invalid');
      }
      if (linkedSubLocationId && !Types.ObjectId.isValid(linkedSubLocationId)) {
        throw createHttpError(400, 'linked_sub_location_id is invalid');
      }

      if (officeId !== ctx.locationId) {
        throw createHttpError(403, 'Access restricted to your assigned office');
      }

      const office: any = await OfficeModel.findById(officeId, { _id: 1 }).lean();
      if (!office) {
        throw createHttpError(404, 'Office not found');
      }

      if (targetType !== 'EMPLOYEE') {
        throw createHttpError(400, 'Employees can only submit requisitions for themselves');
      }
      let requester: any = await EmployeeModel.findOne(
        {
          user_id: ctx.userId,
          is_active: { $ne: false },
        },
        {
          location_id: 1,
          directorate_id: 1,
          office_id: 1,
        }
      ).lean();
      if (!requester && req.user?.email) {
        requester = await EmployeeModel.findOne(
          {
            email: { $regex: `^${escapeRegex(req.user.email)}$`, $options: 'i' },
            is_active: { $ne: false },
          },
          {
            location_id: 1,
            directorate_id: 1,
            office_id: 1,
          }
        ).lean();
      }
      if (!requester) {
        throw createHttpError(403, 'No active employee profile is linked to this user');
      }
      const requesterId = String(requester._id || '');
      if (!requesterId) {
        throw createHttpError(403, 'No active employee profile is linked to this user');
      }
      if (targetId !== requesterId) {
        throw createHttpError(403, 'Employees can only submit requisitions for themselves');
      }

      const requesterLocation = requester.location_id ? String(requester.location_id) : null;
      const requesterDirectorate = requester.directorate_id ? String(requester.directorate_id) : null;
      const requesterOffice = (requester as { office_id?: unknown }).office_id
        ? String((requester as { office_id?: unknown }).office_id)
        : null;
      if (requesterLocation !== officeId && requesterDirectorate !== officeId && requesterOffice !== officeId) {
        throw createHttpError(400, 'Target employee must belong to the selected office');
      }

      const requestedByEmployeeId = requesterId;

      let linkedSubLocationObjectId: Types.ObjectId | null = null;
      if (linkedSubLocationId) {
        const linkedSubLocation: any = await OfficeSubLocationModel.findById(linkedSubLocationId, {
          office_id: 1,
          is_active: 1,
        }).lean();
        if (!linkedSubLocation) {
          throw createHttpError(404, 'Linked room/section not found');
        }
        if (String(linkedSubLocation.office_id || '') !== officeId) {
          throw createHttpError(400, 'Linked room/section must belong to the selected office');
        }
        linkedSubLocationObjectId = new Types.ObjectId(linkedSubLocationId);
      }

      const existing: any = await RequisitionModel.findOne({ file_number: fileNumber }, { _id: 1 }).lean();
      if (existing) {
        throw createHttpError(409, 'fileNumber already exists');
      }

      const moveableAssetIds = Array.from(
        new Set(
          lines
            .filter((line) => line.line_type === 'MOVEABLE')
            .map((line) => line.asset_id)
            .filter((id): id is string => Boolean(id))
        )
      );
      const consumableIds = Array.from(
        new Set(
          lines
            .filter((line) => line.line_type === 'CONSUMABLE')
            .map((line) => line.consumable_id)
            .filter((id): id is string => Boolean(id))
        )
      );

      const [assets, consumables] = await Promise.all([
        moveableAssetIds.length
          ? AssetModel.find({ _id: { $in: moveableAssetIds } }, { name: 1 }).lean()
          : Promise.resolve([]),
        consumableIds.length
          ? ConsumableItemModel.find({ _id: { $in: consumableIds } }, { name: 1 }).lean()
          : Promise.resolve([]),
      ]);
      if (assets.length !== moveableAssetIds.length) {
        throw createHttpError(404, 'One or more moveable assets were not found');
      }
      if (consumables.length !== consumableIds.length) {
        throw createHttpError(404, 'One or more consumable items were not found');
      }
      const assetNameById = new Map(assets.map((asset) => [String(asset._id), String(asset.name || '')]));
      const consumableNameById = new Map(
        consumables.map((consumable) => [String(consumable._id), String(consumable.name || '')])
      );
      const normalizedLines = lines.map((line) => {
        if (line.line_type === 'MOVEABLE') {
          const assetId = line.asset_id || null;
          const assetName = assetId ? assetNameById.get(assetId) || null : null;
          if (assetId && !assetName) {
            throw createHttpError(404, `Asset not found for line asset_id ${assetId}`);
          }
          return {
            ...line,
            requested_name: line.requested_name,
            mapped_name: assetName,
            mapped_by_user_id: assetId ? ctx.userId : null,
            mapped_at: assetId ? new Date() : null,
            consumable_id: null,
          };
        }
        const consumableId = line.consumable_id || null;
        const consumableName = consumableId ? consumableNameById.get(consumableId) || null : null;
        if (consumableId && !consumableName) {
          throw createHttpError(404, `Consumable item not found for line consumable_id ${consumableId}`);
        }
        return {
          ...line,
          requested_name: line.requested_name,
          mapped_name: consumableName,
          mapped_by_user_id: consumableId ? ctx.userId : null,
          mapped_at: consumableId ? new Date() : null,
          asset_id: null,
        };
      });

      const absolutePath = req.file.path;
      const relativePath = path.join('uploads', 'documents', path.basename(absolutePath));
      const fileBuffer = await fs.readFile(absolutePath);
      const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

      const requisition = await RequisitionModel.create({
        file_number: fileNumber,
        office_id: officeId,
        issuing_office_id: officeId,
        target_type: targetType,
        target_id: targetId,
        linked_sub_location_id: linkedSubLocationObjectId,
        requested_by_employee_id: requestedByEmployeeId,
        submitted_by_user_id: ctx.userId,
        fulfilled_by_user_id: null,
        status: 'SUBMITTED',
        remarks,
        attachment_file_name: req.file?.originalname || null,
        attachment_mime_type: req.file?.mimetype || null,
        attachment_size_bytes: req.file?.size ?? null,
        attachment_path: relativePath,
      });
      requisitionId = requisition.id;

      const requisitionLinePayload = normalizedLines.map((line) => ({
        requisition_id: requisition._id,
        ...line,
      }));
      const lineRows = await RequisitionLineModel.insertMany(requisitionLinePayload);

      const document = await DocumentModel.create({
        title: `Requisition ${fileNumber}`,
        doc_type: 'RequisitionForm',
        status: 'Final',
        office_id: officeId,
        created_by_user_id: ctx.userId,
      });
      documentId = document.id;

      const versionId = new Types.ObjectId();
      const version = await DocumentVersionModel.create({
        _id: versionId,
        document_id: document._id,
        version_no: 1,
        file_name: req.file?.originalname,
        mime_type: req.file?.mimetype,
        size_bytes: req.file?.size,
        storage_key: relativePath,
        file_path: relativePath,
        file_url: `/api/documents/versions/${versionId.toString()}/download`,
        sha256,
        uploaded_by_user_id: ctx.userId,
        uploaded_at: new Date(),
      });
      documentVersionId = version.id;

      const link = await DocumentLinkModel.create({
        document_id: document._id,
        entity_type: 'Requisition',
        entity_id: requisition._id,
        required_for_status: null,
      });
      documentLinkId = link.id;

      const responseLines = await enrichLinesWithMappingMetadata(
        lineRows.map((line) => line.toJSON()) as Array<Record<string, unknown>>
      );
      const mappingSummary = buildRequisitionMappingSummary(responseLines as Array<Record<string, unknown>>);

      const [officeHeadUserIds, orgAdminUserIds] = await Promise.all([
        resolveActiveUserIdsByOfficeAndRoles(officeId, ['office_head']),
        resolveActiveOrgAdminUserIds(),
      ]);
      await dispatchRequisitionNotifications({
        officeId,
        requisitionId: requisition.id,
        type: 'REQUISITION_SUBMITTED',
        title: 'Requisition Submitted',
        message: `Requisition ${fileNumber} is submitted and waiting for office head approval.`,
        recipientUserIds: [...officeHeadUserIds, ...orgAdminUserIds, ctx.userId],
      });

      res.status(201).json({
        requisition: {
          ...requisition.toJSON(),
          ...mappingSummary,
        },
        lines: responseLines,
        ...mappingSummary,
      });
    } catch (error) {
      if (documentLinkId) {
        try {
          await DocumentLinkModel.findByIdAndDelete(documentLinkId);
        } catch {
          // ignore cleanup failures
        }
      }
      if (documentVersionId) {
        try {
          await DocumentVersionModel.findByIdAndDelete(documentVersionId);
        } catch {
          // ignore cleanup failures
        }
      }
      if (documentId) {
        try {
          await DocumentModel.findByIdAndDelete(documentId);
        } catch {
          // ignore cleanup failures
        }
      }
      if (requisitionId) {
        try {
          await RequisitionLineModel.deleteMany({ requisition_id: requisitionId });
          await RequisitionModel.findByIdAndDelete(requisitionId);
        } catch {
          // ignore cleanup failures
        }
      }
      if (req.file?.path) {
        try {
          await fs.unlink(req.file.path);
        } catch {
          // ignore cleanup failures
        }
      }

      if (error && typeof error === 'object' && 'code' in error && (error as { code?: number }).code === 11000) {
        return next(createHttpError(409, 'fileNumber already exists'));
      }
      return next(error);
    }
  },
  verify: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      const permissionFlags = await resolveRequisitionPermissionFlags(ctx.role);
      const decision = parseVerifyDecision(req.body?.decision);
      const remarks = asNullableString(req.body?.remarks);

      const requisition = await RequisitionModel.findById(readParam(req, 'id'));
      if (!requisition) {
        throw createHttpError(404, 'Requisition not found');
      }

      const officeId = requisition.office_id?.toString();
      if (!officeId) {
        throw createHttpError(400, 'Requisition office is missing');
      }
      if (!ctx.isOrgAdmin && ctx.role !== 'office_head') {
        throw createHttpError(403, 'Only office head can approve or reject submitted requisitions');
      }

      const hqDirectorate = await isHqDirectorateOffice(officeId);
      const allowedRoles = hqDirectorate ? HQ_DIRECTORATE_VERIFIER_ROLES : DISTRICT_LAB_VERIFIER_ROLES;
      const hasLegacyVerifyAccess = allowedRoles.has(ctx.role);
      const hasDynamicVerifyAccess = permissionFlags.hasStoredRoleEntry && permissionFlags.canManageRequisitions;
      if (!ctx.isOrgAdmin && !hasLegacyVerifyAccess && !hasDynamicVerifyAccess) {
        throw createHttpError(403, 'Not permitted to verify requisition for this office type');
      }

      if (!ctx.isOrgAdmin && ctx.locationId !== officeId) {
        throw createHttpError(403, 'Access restricted to assigned office');
      }

      if (!SUBMITTED_STATUSES.has(String(requisition.status || '').toUpperCase())) {
        throw createHttpError(400, 'Only submitted requisitions can be approved or rejected');
      }

      requisition.status = decision === 'VERIFY' ? 'APPROVED' : 'REJECTED_INVALID';
      requisition.remarks = remarks ?? requisition.remarks ?? null;
      await requisition.save();

      await logAudit({
        ctx,
        action: decision === 'VERIFY' ? 'REQUISITION_VERIFY' : 'REQUISITION_REJECT',
        entityType: 'Requisition',
        entityId: requisition.id,
        officeId,
        diff: {
          decision,
          status: requisition.status,
          remarks: requisition.remarks,
        },
      });

      const [caretakerUserIds, orgAdminUserIds] = await Promise.all([
        resolveActiveUserIdsByOfficeAndRoles(officeId, ['caretaker']),
        resolveActiveOrgAdminUserIds(),
      ]);
      const statusMessage =
        decision === 'VERIFY'
          ? `Requisition ${requisition.file_number} has been approved and moved to caretaker fulfillment queue.`
          : `Requisition ${requisition.file_number} has been rejected by office head.`;
      await dispatchRequisitionNotifications({
        officeId,
        requisitionId: requisition.id,
        type: decision === 'VERIFY' ? 'REQUISITION_APPROVED' : 'REQUISITION_REJECTED',
        title: decision === 'VERIFY' ? 'Requisition Approved' : 'Requisition Rejected',
        message: statusMessage,
        recipientUserIds:
          decision === 'VERIFY'
            ? [String(requisition.submitted_by_user_id || ''), ...caretakerUserIds, ...orgAdminUserIds]
            : [String(requisition.submitted_by_user_id || ''), ...orgAdminUserIds],
      });

      return res.json(requisition);
    } catch (error) {
      return next(error);
    }
  },
  adjust: async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    try {
      const ctx = await getRequestContext(req);
      const permissionFlags = await resolveRequisitionPermissionFlags(ctx.role);
      const { reason, adjustments } = parseAdjustRequest(req.body);
      const adjustmentsNote = summarizeAdjustmentsForNotes(adjustments);

      let responsePayload: {
        requisition: unknown;
        previousRecord: unknown;
        newRecord: unknown;
        archivedIssueSlipDocumentIds: string[];
      } | null = null;
      let adjustNotification: {
        officeId: string;
        requisitionId: string;
        fileNumber: string;
        submittedByUserId: string | null;
      } | null = null;

      await session.withTransaction(async () => {
        const requisition = await RequisitionModel.findById(readParam(req, 'id')).session(session);
        if (!requisition) {
          throw createHttpError(404, 'Requisition not found');
        }

        const issuingOfficeId = requisition.issuing_office_id?.toString();
        if (!issuingOfficeId) {
          throw createHttpError(400, 'Requisition issuing office is missing');
        }

        if (!ADJUST_ALLOWED_STATUSES.has(String(requisition.status))) {
          throw createHttpError(400, 'Only fulfilled requisitions can be adjusted');
        }

        const hqDirectorate = await isHqDirectorateOffice(issuingOfficeId);
        const allowedRoles = hqDirectorate ? HQ_DIRECTORATE_FULFILLER_ROLES : DISTRICT_LAB_FULFILLER_ROLES;
        const hasLegacyAdjustAccess = allowedRoles.has(ctx.role);
        const hasDynamicAdjustAccess = permissionFlags.hasStoredRoleEntry && permissionFlags.canManageRequisitions;
        if (!ctx.isOrgAdmin && !hasLegacyAdjustAccess && !hasDynamicAdjustAccess) {
          throw createHttpError(403, 'Not permitted to adjust requisition for this office type');
        }
        if (!ctx.isOrgAdmin && ctx.locationId !== issuingOfficeId) {
          throw createHttpError(403, 'Access restricted to assigned office');
        }

        if (!requisition.record_id) {
          throw createHttpError(400, 'Associated issue record is missing');
        }
        const previousRecord = await RecordModel.findById(requisition.record_id).session(session);
        if (!previousRecord) {
          throw createHttpError(404, 'Associated issue record not found');
        }
        if (String(previousRecord.record_type) !== 'ISSUE') {
          throw createHttpError(400, 'Associated record must be an ISSUE record');
        }

        const issueSlipCandidateIds = new Set<string>();
        if (requisition.signed_issuance_document_id) {
          issueSlipCandidateIds.add(String(requisition.signed_issuance_document_id));
        }

        const linkedDocs = await DocumentLinkModel.find(
          {
            $or: [
              { entity_type: 'Requisition', entity_id: requisition._id },
              { entity_type: 'Record', entity_id: previousRecord._id },
            ],
          },
          { document_id: 1 }
        )
          .session(session)
          .lean();
        for (const link of linkedDocs) {
          if (link.document_id) {
            issueSlipCandidateIds.add(String(link.document_id));
          }
        }

        const archivedIssueSlipDocumentIds: string[] = [];
        if (issueSlipCandidateIds.size > 0) {
          const issueSlipDocs = await DocumentModel.find({
            _id: { $in: Array.from(issueSlipCandidateIds) },
            doc_type: 'IssueSlip',
            status: { $ne: 'Archived' },
          }).session(session);

          for (const doc of issueSlipDocs) {
            doc.status = 'Archived';
            await doc.save({ session });
            archivedIssueSlipDocumentIds.push(doc.id);
          }
        }

        const previousRecordId = previousRecord.id;
        const previousSignedDocumentId = requisition.signed_issuance_document_id
          ? String(requisition.signed_issuance_document_id)
          : null;

        const newIssueRecord = await createRecord(
          ctx,
          {
            recordType: 'ISSUE',
            officeId: issuingOfficeId,
            status: 'Draft',
            notes: `Requisition ${requisition.file_number} adjusted. Reason: ${reason}. Adjustments: ${adjustmentsNote}`,
          },
          session
        );

        requisition.record_id = newIssueRecord._id as any;
        requisition.status = 'PARTIALLY_FULFILLED';
        requisition.signed_issuance_document_id = null;
        requisition.signed_issuance_uploaded_at = null;
        await requisition.save({ session });
        adjustNotification = {
          officeId: issuingOfficeId,
          requisitionId: requisition.id,
          fileNumber: String(requisition.file_number || requisition.id),
          submittedByUserId: requisition.submitted_by_user_id
            ? String(requisition.submitted_by_user_id)
            : null,
        };

        await logAudit({
          ctx,
          action: 'REQUISITION_ADJUST',
          entityType: 'Requisition',
          entityId: requisition.id,
          officeId: issuingOfficeId,
          diff: {
            reason,
            adjustments,
            previousRecordId,
            newRecordId: newIssueRecord.id,
            archivedIssueSlipDocumentIds,
            previousSignedIssuanceDocumentId: previousSignedDocumentId,
            status: requisition.status,
          },
          session,
        });

        responsePayload = {
          requisition: requisition.toJSON(),
          previousRecord: previousRecord.toJSON(),
          newRecord: newIssueRecord.toJSON(),
          archivedIssueSlipDocumentIds,
        };
      });

      if (!responsePayload) {
        throw createHttpError(500, 'Failed to adjust requisition');
      }
      if (adjustNotification) {
        const [officeHeadUserIds, caretakerUserIds, orgAdminUserIds] = await Promise.all([
          resolveActiveUserIdsByOfficeAndRoles(adjustNotification.officeId, ['office_head']),
          resolveActiveUserIdsByOfficeAndRoles(adjustNotification.officeId, ['caretaker']),
          resolveActiveOrgAdminUserIds(),
        ]);
        await dispatchRequisitionNotifications({
          officeId: adjustNotification.officeId,
          requisitionId: adjustNotification.requisitionId,
          type: 'REQUISITION_ADJUSTED',
          title: 'Requisition Adjusted',
          message: `Requisition ${adjustNotification.fileNumber} was adjusted and moved back to fulfillment.`,
          recipientUserIds: [
            adjustNotification.submittedByUserId,
            ...officeHeadUserIds,
            ...caretakerUserIds,
            ...orgAdminUserIds,
          ],
        });
      }

      return res.json(responsePayload);
    } catch (error) {
      return next(error);
    } finally {
      session.endSession();
    }
  },
  uploadSignedIssuance: async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    const uploadedFile = getSignedIssuanceFile(req as AuthRequestWithFiles);
    try {
      if (!uploadedFile) {
        throw createHttpError(400, 'Signed issuance file is required');
      }
      await assertUploadedFileIntegrity(uploadedFile, 'signedIssuanceFile');

      const ctx = await getRequestContext(req);
      const permissionFlags = await resolveRequisitionPermissionFlags(ctx.role);
      let responsePayload: {
        requisition: unknown;
        record: unknown;
        document: unknown;
        documentVersion: unknown;
      } | null = null;
      let signedUploadNotification: {
        officeId: string;
        requisitionId: string;
        fileNumber: string;
        submittedByUserId: string | null;
      } | null = null;

      await session.withTransaction(async () => {
        const requisition = await RequisitionModel.findById(readParam(req, 'id')).session(session);
        if (!requisition) {
          throw createHttpError(404, 'Requisition not found');
        }

        const issuingOfficeId = requisition.issuing_office_id?.toString();
        if (!issuingOfficeId) {
          throw createHttpError(400, 'Requisition issuing office is missing');
        }

        if (String(requisition.status) !== 'FULFILLED_PENDING_SIGNATURE') {
          throw createHttpError(400, 'Signed issuance upload is allowed only in FULFILLED_PENDING_SIGNATURE');
        }

        const hqDirectorate = await isHqDirectorateOffice(issuingOfficeId);
        const allowedRoles = hqDirectorate ? HQ_DIRECTORATE_FULFILLER_ROLES : DISTRICT_LAB_FULFILLER_ROLES;
        const hasLegacyFinalizeAccess = allowedRoles.has(ctx.role);
        const hasDynamicFinalizeAccess = permissionFlags.hasStoredRoleEntry && permissionFlags.canManageRequisitions;
        if (!ctx.isOrgAdmin && !hasLegacyFinalizeAccess && !hasDynamicFinalizeAccess) {
          throw createHttpError(403, 'Not permitted to finalize requisition for this office type');
        }
        if (!ctx.isOrgAdmin && ctx.locationId !== issuingOfficeId) {
          throw createHttpError(403, 'Access restricted to assigned office');
        }

        if (!requisition.record_id) {
          throw createHttpError(400, 'Associated issue record is missing');
        }

        const issueRecord = await RecordModel.findById(requisition.record_id).session(session);
        if (!issueRecord) {
          throw createHttpError(404, 'Associated issue record not found');
        }
        if (String(issueRecord.record_type) !== 'ISSUE') {
          throw createHttpError(400, 'Associated record must be an ISSUE record');
        }

        const requisitionLinks = await DocumentLinkModel.find(
          { entity_type: 'Requisition', entity_id: requisition._id },
          { document_id: 1 }
        )
          .session(session)
          .lean();
        const linkedDocIds = requisitionLinks
          .map((link) => link.document_id?.toString())
          .filter((id): id is string => Boolean(id));

        let issueSlipDoc = linkedDocIds.length
          ? await DocumentModel.findOne({
              _id: { $in: linkedDocIds },
              doc_type: 'IssueSlip',
              status: { $ne: 'Archived' },
            })
              .sort({ created_at: -1 })
              .session(session)
          : null;

        if (!issueSlipDoc) {
          issueSlipDoc = await DocumentModel.create(
            [
              {
                title: `Issue Slip ${requisition.file_number}`,
                doc_type: 'IssueSlip',
                status: 'Final',
                office_id: issuingOfficeId,
                created_by_user_id: ctx.userId,
              },
            ],
            { session }
          ).then((rows) => rows[0]);

          await DocumentLinkModel.create(
            [
              {
                document_id: issueSlipDoc._id,
                entity_type: 'Requisition',
                entity_id: requisition._id,
                required_for_status: null,
              },
            ],
            { session }
          );
        } else {
          issueSlipDoc.status = 'Final';
          await issueSlipDoc.save({ session });
        }

        const recordLinkExists = await DocumentLinkModel.findOne({
          document_id: issueSlipDoc._id,
          entity_type: 'Record',
          entity_id: issueRecord._id,
        }).session(session);
        if (!recordLinkExists) {
          await DocumentLinkModel.create(
            [
              {
                document_id: issueSlipDoc._id,
                entity_type: 'Record',
                entity_id: issueRecord._id,
                required_for_status: 'Completed',
              },
            ],
            { session }
          );
        }

        const relativePath = path.join('uploads', 'documents', path.basename(uploadedFile.path)).replace(/\\/g, '/');
        const fileBuffer = await fs.readFile(uploadedFile.path);
        const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
        const lastVersion: any = await DocumentVersionModel.findOne({ document_id: issueSlipDoc._id }, { version_no: 1 })
          .sort({ version_no: -1 })
          .session(session)
          .lean()
          .exec();
        const nextVersion = lastVersion && typeof lastVersion.version_no === 'number' ? lastVersion.version_no + 1 : 1;
        const versionId = new Types.ObjectId();

        const version = await DocumentVersionModel.create(
          [
            {
              _id: versionId,
              document_id: issueSlipDoc._id,
              version_no: nextVersion,
              file_name: uploadedFile.originalname,
              mime_type: uploadedFile.mimetype,
              size_bytes: uploadedFile.size,
              storage_key: relativePath,
              file_path: relativePath,
              file_url: `/api/documents/versions/${versionId.toString()}/download`,
              sha256,
              uploaded_by_user_id: ctx.userId,
              uploaded_at: new Date(),
            },
          ],
          { session }
        ).then((rows) => rows[0]);

        issueRecord.status = 'Completed';
        await issueRecord.save({ session });

        requisition.status = 'FULFILLED';
        requisition.signed_issuance_document_id = issueSlipDoc._id as any;
        requisition.signed_issuance_uploaded_at = new Date();
        await requisition.save({ session });
        signedUploadNotification = {
          officeId: issuingOfficeId,
          requisitionId: requisition.id,
          fileNumber: String(requisition.file_number || requisition.id),
          submittedByUserId: requisition.submitted_by_user_id
            ? String(requisition.submitted_by_user_id)
            : null,
        };

        await logAudit({
          ctx,
          action: 'REQUISITION_SIGNED_ISSUANCE_UPLOAD',
          entityType: 'Requisition',
          entityId: requisition.id,
          officeId: issuingOfficeId,
          diff: {
            requisitionStatus: requisition.status,
            recordStatus: issueRecord.status,
            documentId: issueSlipDoc.id,
            documentVersionId: version.id,
          },
          session,
        });

        responsePayload = {
          requisition: requisition.toJSON(),
          record: issueRecord.toJSON(),
          document: issueSlipDoc.toJSON(),
          documentVersion: version.toJSON(),
        };
      });

      if (!responsePayload) {
        throw createHttpError(500, 'Failed to finalize requisition');
      }
      if (signedUploadNotification) {
        const [officeHeadUserIds, caretakerUserIds, orgAdminUserIds] = await Promise.all([
          resolveActiveUserIdsByOfficeAndRoles(signedUploadNotification.officeId, ['office_head']),
          resolveActiveUserIdsByOfficeAndRoles(signedUploadNotification.officeId, ['caretaker']),
          resolveActiveOrgAdminUserIds(),
        ]);
        await dispatchRequisitionNotifications({
          officeId: signedUploadNotification.officeId,
          requisitionId: signedUploadNotification.requisitionId,
          type: 'REQUISITION_ISSUANCE_SIGNED',
          title: 'Signed Issuance Uploaded',
          message: `Signed issuance for requisition ${signedUploadNotification.fileNumber} was uploaded.`,
          recipientUserIds: [
            signedUploadNotification.submittedByUserId,
            ...officeHeadUserIds,
            ...caretakerUserIds,
            ...orgAdminUserIds,
          ],
        });
      }
      return res.json(responsePayload);
    } catch (error) {
      if (uploadedFile?.path) {
        try {
          await fs.unlink(uploadedFile.path);
        } catch {
          // ignore cleanup failures
        }
      }
      return next(error);
    } finally {
      session.endSession();
    }
  },
  issuanceReport: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      const report = await generateAndStoreIssuanceReport(ctx, readParam(req, 'id'));
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${report.downloadFileName}"`);
      return res.status(200).send(report.buffer);
    } catch (error) {
      return next(error);
    }
  },
  fulfill: async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    try {
      const ctx = await getRequestContext(req);
      const permissionFlags = await resolveRequisitionPermissionFlags(ctx.role);
      const payloadLines = parseFulfillLinesInput(req.body);

      const requisition = await RequisitionModel.findById(readParam(req, 'id')).session(session);
      if (!requisition) {
        throw createHttpError(404, 'Requisition not found');
      }

      const issuingOfficeId = requisition.issuing_office_id?.toString();
      if (!issuingOfficeId) {
        throw createHttpError(400, 'Requisition issuing office is missing');
      }

      if (!FULFILL_ALLOWED_STATUSES.has(String(requisition.status))) {
        throw createHttpError(400, 'Requisition is not ready for fulfillment');
      }

      const hqDirectorate = await isHqDirectorateOffice(issuingOfficeId);
      const allowedRoles = hqDirectorate ? HQ_DIRECTORATE_FULFILLER_ROLES : DISTRICT_LAB_FULFILLER_ROLES;
      if (!ctx.isOrgAdmin && ctx.role !== 'caretaker') {
        throw createHttpError(403, 'Only caretaker can fulfill approved requisitions');
      }
      const hasLegacyFulfillAccess = allowedRoles.has(ctx.role);
      const hasDynamicFulfillAccess = permissionFlags.hasStoredRoleEntry && permissionFlags.canManageRequisitions;
      if (!ctx.isOrgAdmin && !hasLegacyFulfillAccess && !hasDynamicFulfillAccess) {
        throw createHttpError(403, 'Not permitted to fulfill requisition for this office type');
      }

      if (!ctx.isOrgAdmin && ctx.locationId !== issuingOfficeId) {
        throw createHttpError(403, 'Access restricted to assigned office');
      }

      const requestedLineIds = payloadLines.map((line) => line.lineId);
      const dbLines = await RequisitionLineModel.find({
        _id: { $in: requestedLineIds },
        requisition_id: requisition._id,
      }).session(session);
      if (dbLines.length !== requestedLineIds.length) {
        throw createHttpError(404, 'One or more requisition lines were not found');
      }
      const dbLineById = new Map(dbLines.map((line) => [line.id, line]));

      const moveableTargetIds = payloadLines
        .flatMap((line) => line.assignedAssetItemIds)
        .filter(Boolean);
      const duplicateTargetIds = moveableTargetIds.filter((id, idx) => moveableTargetIds.indexOf(id) !== idx);
      if (duplicateTargetIds.length > 0) {
        throw createHttpError(400, 'Duplicate asset item ids in fulfillment payload');
      }

      let responsePayload: {
        requisition: unknown;
        lines: unknown[];
        has_unmapped_lines: boolean;
        unmapped_lines_count: number;
        assignments: unknown[];
        consumableTransactions: unknown[];
      } | null = null;
      const issuedAssignmentIds: string[] = [];
      let nextRequisitionStatus: string | null = null;

      await session.withTransaction(async () => {
        let issueRecordId = requisition.record_id ? requisition.record_id.toString() : null;
        if (!issueRecordId) {
          const issueRecord = await createRecord(
            ctx,
            {
              recordType: 'ISSUE',
              officeId: issuingOfficeId,
              status: 'Draft',
              notes: `Requisition ${requisition.file_number} fulfillment`,
            },
            session
          );
          issueRecordId = issueRecord.id;
          requisition.record_id = issueRecord._id;
        }

        const preloadConsumableItemIds = uniqueObjectIdStrings(
          payloadLines.map((payloadLine) => {
            const line = dbLineById.get(payloadLine.lineId);
            return line?.consumable_id ? String(line.consumable_id) : null;
          })
        );
        const [prefetchedMoveableAssetItems, prefetchedOpenAssignments, prefetchedConsumableItems] = await Promise.all([
          moveableTargetIds.length > 0
            ? AssetItemModel.find({ _id: { $in: moveableTargetIds } }).session(session)
            : Promise.resolve([]),
          moveableTargetIds.length > 0
            ? AssignmentModel.find(
                {
                  asset_item_id: { $in: moveableTargetIds },
                  status: { $in: Array.from(OPEN_ASSIGNMENT_STATUSES) },
                },
                { asset_item_id: 1 }
              ).session(session)
            : Promise.resolve([]),
          preloadConsumableItemIds.length > 0
            ? ConsumableItemModel.find({ _id: { $in: preloadConsumableItemIds } }).session(session)
            : Promise.resolve([]),
        ]);

        const prefetchedMoveableAssetItemById = new Map(
          prefetchedMoveableAssetItems.map((item) => [String(item._id), item])
        );
        const prefetchedOpenAssignmentAssetItemIds = new Set(
          prefetchedOpenAssignments
            .map((row) => (row.asset_item_id ? String(row.asset_item_id) : null))
            .filter((id): id is string => Boolean(id))
        );
        const prefetchedConsumableItemById = new Map(
          prefetchedConsumableItems.map((item) => [String(item._id), item])
        );

        const createdAssignments: unknown[] = [];
        const consumableTransactions: unknown[] = [];
        const pendingIssueRecordAssignments: Array<{
          assignmentId: string;
          assetItemId: string;
          employeeId?: string;
          notes: string;
        }> = [];
        const pendingConsumableTransactionDocs: Array<Record<string, unknown>> = [];
        const lineUpdateOps: Array<{
          updateOne: {
            filter: { _id: unknown };
            update: { $set: { fulfilled_quantity: number; status: string } };
          };
        }> = [];

        for (const payloadLine of payloadLines) {
          const line = dbLineById.get(payloadLine.lineId);
          if (!line) throw createHttpError(404, 'Requisition line not found');
          if (line.status === 'CANCELLED') continue;

          const approvedQty =
            line.approved_quantity === null || line.approved_quantity === undefined
              ? Number(line.requested_quantity || 0)
              : Number(line.approved_quantity || 0);
          const remainingQty = getRemainingQuantity(line);
          let additionalFulfilled = 0;

          if (line.line_type === 'MOVEABLE') {
            const assignIds = payloadLine.assignedAssetItemIds;
            if (assignIds.length > remainingQty) {
              throw createHttpError(400, `Moveable line ${line.id} exceeds approved quantity`);
            }
            if (assignIds.length > 0) {
              const mappedAssetId = line.asset_id ? String(line.asset_id) : null;
              if (!mappedAssetId) {
                throw createHttpError(400, `Moveable line ${line.id} must be mapped to an asset before fulfillment`);
              }
              const targetType = String(requisition.target_type || '').toUpperCase();
              if (!TARGET_TYPES.has(targetType)) {
                throw createHttpError(400, 'Requisition target is invalid');
              }
              if (!requisition.target_id || !Types.ObjectId.isValid(String(requisition.target_id))) {
                throw createHttpError(400, 'Requisition target_id is invalid');
              }
              const assetItems = assignIds
                .map((assignId) => prefetchedMoveableAssetItemById.get(assignId) || null)
                .filter((item): item is NonNullable<typeof item> => Boolean(item));
              if (assetItems.length !== assignIds.length) {
                throw createHttpError(404, `One or more asset items were not found for line ${line.id}`);
              }
              const blockedIds = assignIds.filter((assignId) => prefetchedOpenAssignmentAssetItemIds.has(assignId));
              if (blockedIds.length > 0) {
                throw createHttpError(400, `Asset item(s) already have open assignments: ${blockedIds.join(', ')}`);
              }
              for (const item of assetItems) {
                if (String(item.asset_id || '') !== mappedAssetId) {
                  throw createHttpError(400, `Asset item ${item.id} does not match mapped asset for line ${line.id}`);
                }
                if (!isAssetItemHeldByOffice(item, issuingOfficeId)) {
                  throw createHttpError(400, `Asset item ${item.id} is not in the issuing office`);
                }
                if (item.assignment_status === 'Assigned') {
                  throw createHttpError(400, `Asset item ${item.id} is already assigned`);
                }
                if (item.is_active === false) {
                  throw createHttpError(400, `Asset item ${item.id} is inactive`);
                }
              }

              const assignmentRows = await AssignmentModel.insertMany(
                assetItems.map((item) => ({
                  asset_item_id: item._id,
                  status: 'ISSUED',
                  assigned_to_type: targetType,
                  assigned_to_id: requisition.target_id,
                  employee_id: targetType === 'EMPLOYEE' ? requisition.target_id : null,
                  requisition_id: requisition._id,
                  requisition_line_id: line._id,
                  issued_by_user_id: ctx.userId,
                  issued_at: new Date(),
                  assigned_date: new Date(),
                  expected_return_date: null,
                  returned_date: null,
                  notes: `Issued via requisition ${requisition.file_number} line ${line.id}`,
                  is_active: true,
                })),
                { session }
              );

              await AssetItemModel.updateMany(
                { _id: { $in: assignIds } },
                { $set: { assignment_status: 'Assigned', item_status: 'Assigned' } },
                { session }
              );

              pendingIssueRecordAssignments.push(
                ...assignmentRows.map((assignment) => ({
                  assignmentId: String(assignment._id),
                  assetItemId: String(assignment.asset_item_id || ''),
                  employeeId: targetType === 'EMPLOYEE' ? String(requisition.target_id || '') : undefined,
                  notes: `Issued via requisition ${requisition.file_number} line ${line.id}`,
                }))
              );

              createdAssignments.push(...assignmentRows.map((assignment) => assignment.toJSON()));
              issuedAssignmentIds.push(...assignmentRows.map((assignment) => String(assignment._id)));
              additionalFulfilled = assignmentRows.length;
            }
          } else if (line.line_type === 'CONSUMABLE') {
            const requestedIssue = Math.max(Number(payloadLine.issuedQuantity || 0), 0);
            if (requestedIssue > 0 && remainingQty <= 0) {
              throw createHttpError(400, `Consumable line ${line.id} is already fully fulfilled`);
            }

            const issueCap = Math.min(requestedIssue, remainingQty);
            if (issueCap > 0) {
              const lineConsumableId = line.consumable_id ? String(line.consumable_id) : null;
              if (!lineConsumableId) {
                throw createHttpError(400, `Consumable line ${line.id} must be mapped before fulfillment`);
              }
              const item = prefetchedConsumableItemById.get(lineConsumableId) || null;

              if (item) {
                const balances = await ConsumableInventoryBalanceModel.find({
                  $or: [
                    { holder_type: 'OFFICE', holder_id: issuingOfficeId },
                    { holder_type: { $exists: false }, location_id: issuingOfficeId },
                    { holder_type: null, location_id: issuingOfficeId },
                  ],
                  consumable_item_id: item._id,
                  qty_on_hand_base: { $gt: 0 },
                })
                  .sort({ created_at: 1 })
                  .session(session);

                let remainingToIssue = issueCap;
                const balanceUpdates: Array<{
                  updateOne: {
                    filter: { _id: unknown };
                    update: { $set: { qty_on_hand_base: number } };
                  };
                }> = [];
                const transactionDocs: Array<Record<string, unknown>> = [];
                for (const balance of balances) {
                  if (remainingToIssue <= 0) break;
                  const available = Math.max(Number(balance.qty_on_hand_base || 0), 0);
                  if (available <= 0) continue;
                  const take = Math.min(available, remainingToIssue);
                  if (take <= 0) continue;

                  balanceUpdates.push({
                    updateOne: {
                      filter: { _id: balance._id },
                      update: { $set: { qty_on_hand_base: available - take } },
                    },
                  });
                  transactionDocs.push({
                    tx_type: 'CONSUME',
                    tx_time: new Date().toISOString(),
                    created_by: ctx.userId,
                    from_holder_type: 'OFFICE',
                    from_holder_id: issuingOfficeId,
                    to_holder_type: null,
                    to_holder_id: null,
                    consumable_item_id: item._id,
                    lot_id: balance.lot_id || null,
                    container_id: null,
                    qty_base: take,
                    entered_qty: take,
                    entered_uom: item.base_uom,
                    reason_code_id: null,
                    reference: requisition.file_number,
                    notes: `Requisition ${requisition.file_number} line ${line.id}`,
                    metadata: {
                      requisitionId: requisition.id,
                      requisitionLineId: line.id,
                      recordId: issueRecordId,
                    },
                  });
                  additionalFulfilled += take;
                  remainingToIssue -= take;
                }

                if (balanceUpdates.length > 0) {
                  await ConsumableInventoryBalanceModel.bulkWrite(balanceUpdates, { session });
                }
                if (transactionDocs.length > 0) {
                  pendingConsumableTransactionDocs.push(...transactionDocs);
                }
              }
            }
          }

          const nextFulfilled = Number(line.fulfilled_quantity || 0) + additionalFulfilled;
          let nextLineStatus = 'PARTIALLY_ASSIGNED';
          if (nextFulfilled <= 0) {
            nextLineStatus = 'NOT_AVAILABLE';
          } else if (nextFulfilled === approvedQty) {
            nextLineStatus = 'ASSIGNED';
          }
          lineUpdateOps.push({
            updateOne: {
              filter: { _id: line._id },
              update: {
                $set: {
                  fulfilled_quantity: nextFulfilled,
                  status: nextLineStatus,
                },
              },
            },
          });
        }

        if (lineUpdateOps.length > 0) {
          await RequisitionLineModel.bulkWrite(lineUpdateOps, { session });
        }

        if (pendingIssueRecordAssignments.length > 0) {
          const assignmentIds = pendingIssueRecordAssignments.map((entry) => entry.assignmentId);
          const existingIssueRecords = await RecordModel.find(
            {
              record_type: 'ISSUE',
              assignment_id: { $in: assignmentIds },
            },
            { _id: 1, assignment_id: 1, status: 1 }
          ).session(session);
          const existingIssueRecordByAssignmentId = new Map(
            existingIssueRecords
              .filter((record) => record.assignment_id)
              .map((record) => [String(record.assignment_id), record])
          );

          const recordsNeedingCompletion = existingIssueRecords.filter(
            (record) => String(record.status || '') !== 'Completed'
          );
          if (recordsNeedingCompletion.length > 0) {
            await RecordModel.bulkWrite(
              recordsNeedingCompletion.map((record) => ({
                updateOne: {
                  filter: { _id: record._id },
                  update: { $set: { status: 'Completed' } },
                },
              })),
              { session }
            );
          }

          const missingIssueRecords = pendingIssueRecordAssignments.filter(
            (assignment) => !existingIssueRecordByAssignmentId.has(assignment.assignmentId)
          );
          for (const assignment of missingIssueRecords) {
            await createRecord(
              ctx,
              {
                recordType: 'ISSUE',
                officeId: issuingOfficeId,
                status: 'Completed',
                assetItemId: assignment.assetItemId,
                employeeId: assignment.employeeId,
                assignmentId: assignment.assignmentId,
                notes: assignment.notes,
              },
              session
            );
          }
        }

        if (pendingConsumableTransactionDocs.length > 0) {
          const txRows = await ConsumableInventoryTransactionModel.insertMany(pendingConsumableTransactionDocs, {
            session,
          });
          consumableTransactions.push(...txRows.map((tx) => tx.toJSON()));
        }

        const finalLines = await RequisitionLineModel.find({ requisition_id: requisition._id }).session(session);
        const allFulfilled = finalLines.every((line) => {
          const approved =
            line.approved_quantity === null || line.approved_quantity === undefined
              ? Number(line.requested_quantity || 0)
              : Number(line.approved_quantity || 0);
          return Number(line.fulfilled_quantity || 0) === approved;
        });

        requisition.fulfilled_by_user_id = ctx.userId as any;
        requisition.status = allFulfilled ? 'FULFILLED' : 'PARTIALLY_FULFILLED';
        await requisition.save({ session });
        nextRequisitionStatus = String(requisition.status || '');

        if (issueRecordId) {
          const issueRecord = await RecordModel.findById(issueRecordId).session(session);
          if (issueRecord) {
            issueRecord.status = allFulfilled ? 'Completed' : 'Draft';
            await issueRecord.save({ session });
          }
        }

        await logAudit({
          ctx,
          action: 'REQUISITION_FULFILL',
          entityType: 'Requisition',
          entityId: requisition.id,
          officeId: issuingOfficeId,
          diff: {
            status: requisition.status,
            lines: payloadLines.map((line) => ({
              lineId: line.lineId,
              assignedAssetItemIds: line.assignedAssetItemIds,
              issuedQuantity: line.issuedQuantity,
            })),
          },
          session,
        });

        const responseLines = await enrichLinesWithMappingMetadata(
          finalLines.map((line) => line.toJSON()) as Array<Record<string, unknown>>
        );
        const mappingSummary = buildRequisitionMappingSummary(responseLines as Array<Record<string, unknown>>);
        responsePayload = {
          requisition: {
            ...requisition.toJSON(),
            ...mappingSummary,
          },
          lines: responseLines,
          ...mappingSummary,
          assignments: createdAssignments,
          consumableTransactions,
        };
      });

      if (issuedAssignmentIds.length > 0) {
        await Promise.allSettled(
          issuedAssignmentIds.map((assignmentId) =>
            generateHandoverSlip({
              assignmentId,
              generatedByUserId: ctx.userId,
            })
          )
        );
      }

      const [officeHeadUserIds, caretakerUserIds, orgAdminUserIds] = await Promise.all([
        resolveActiveUserIdsByOfficeAndRoles(issuingOfficeId, ['office_head']),
        resolveActiveUserIdsByOfficeAndRoles(issuingOfficeId, ['caretaker']),
        resolveActiveOrgAdminUserIds(),
      ]);
      const normalizedStatus = String(nextRequisitionStatus || '').toUpperCase();
      const stageType =
        normalizedStatus === 'FULFILLED' ? 'REQUISITION_FULFILLED' : 'REQUISITION_STATUS_CHANGED';
      const stageTitle =
        normalizedStatus === 'FULFILLED' ? 'Requisition Fulfilled' : 'Requisition Status Updated';
      const stageMessage =
        normalizedStatus === 'FULFILLED'
          ? `Requisition ${requisition.file_number} has been fulfilled and completed.`
          : `Requisition ${requisition.file_number} moved to status ${normalizedStatus}.`;
      await dispatchRequisitionNotifications({
        officeId: issuingOfficeId,
        requisitionId: requisition.id,
        type: stageType,
        title: stageTitle,
        message: stageMessage,
        recipientUserIds: [
          String(requisition.submitted_by_user_id || ''),
          ...officeHeadUserIds,
          ...caretakerUserIds,
          ...orgAdminUserIds,
        ],
      });

      if (!responsePayload) {
        throw createHttpError(500, 'Failed to fulfill requisition');
      }
      return res.json(responsePayload);
    } catch (error) {
      return next(error);
    } finally {
      session.endSession();
    }
  },
};




