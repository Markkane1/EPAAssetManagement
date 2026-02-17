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
import { assertUploadedFileIntegrity } from '../utils/uploadValidation';

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
  normalizeLineType,
  enrichLinesWithMappingMetadata,
  buildRequisitionMappingSummary,
  dispatchDraftAssignmentNotifications,
} from './requisition.controller.helpers';

export const requisitionController = {
  list: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      const canViewAll = ctx.role === 'org_admin' || ctx.isOrgAdmin;
      const page = parsePositiveInt(req.query.page, 1, 100_000);
      const limit = parsePositiveInt(req.query.limit, 50, 200);
      const skip = (page - 1) * limit;
      const status = asNullableString(req.query.status);
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
      if (!canViewAll) {
        if (!ctx.locationId) throw createHttpError(403, 'User is not assigned to an office');
        if (officeId && officeId !== ctx.locationId) {
          throw createHttpError(403, 'Access restricted to assigned office');
        }
        filter.office_id = ctx.locationId;
      } else if (officeId) {
        filter.office_id = officeId;
      }

      if (status) filter.status = status;
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
      const canViewAll = ctx.role === 'org_admin' || ctx.isOrgAdmin;

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
      }

      const linesPromise = RequisitionLineModel.find({ requisition_id: requisition._id }).sort({ created_at: 1 }).lean();
      const linkedDocIdsPromise = DocumentLinkModel.find(
        { entity_type: 'Requisition', entity_id: requisition._id },
        { document_id: 1 }
      ).lean();

      const [lines, linkRows] = await Promise.all([linesPromise, linkedDocIdsPromise]);
      const linkedDocIds = linkRows
        .map((row) => (row.document_id ? String(row.document_id) : null))
        .filter((id): id is string => Boolean(id));

      let requisitionFormDoc: any = null;
      let issueSlipDoc: any = null;
      if (linkedDocIds.length > 0) {
        const docs = await DocumentModel.find({
          _id: { $in: linkedDocIds },
          doc_type: { $in: ['RequisitionForm', 'IssueSlip'] },
        })
          .sort({ created_at: -1 })
          .lean();

        requisitionFormDoc = docs.find((doc) => String(doc.doc_type) === 'RequisitionForm') || null;
        issueSlipDoc =
          docs.find(
            (doc) =>
              String(doc.doc_type) === 'IssueSlip' &&
              (String(doc.status) === 'Draft' || String(doc.status) === 'Final')
          ) || null;
      }

      const getLatestVersion = async (doc: any) => {
        if (!doc?._id) return null;
        return DocumentVersionModel.findOne(
          { document_id: doc._id },
          { version_no: 1, file_name: 1, mime_type: 1, size_bytes: 1, uploaded_at: 1, file_url: 1 }
        )
          .sort({ version_no: -1 })
          .lean();
      };

      const [requisitionFormVersion, issueSlipVersion] = await Promise.all([
        getLatestVersion(requisitionFormDoc),
        getLatestVersion(issueSlipDoc),
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
          requisitionForm: requisitionFormDoc
            ? {
                id: requisitionFormDoc._id,
                title: requisitionFormDoc.title,
                doc_type: requisitionFormDoc.doc_type,
                status: requisitionFormDoc.status,
                created_at: requisitionFormDoc.created_at,
                latestVersion: requisitionFormVersion,
              }
            : null,
          issueSlip: issueSlipDoc
            ? {
                id: issueSlipDoc._id,
                title: issueSlipDoc.title,
                doc_type: issueSlipDoc.doc_type,
                status: issueSlipDoc.status,
                created_at: issueSlipDoc.created_at,
                latestVersion: issueSlipVersion,
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
      if (!ctx.isOrgAdmin && !['office_head', 'caretaker'].includes(ctx.role)) {
        throw createHttpError(403, 'Not permitted to map requisition lines');
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

      const lineType = normalizeLineType(line.line_type);
      if (lineType !== mapType) {
        throw createHttpError(400, `Line type ${lineType} cannot be mapped as ${mapType}`);
      }

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
      if (!ALLOWED_SUBMITTER_ROLES.has(ctx.role)) {
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
      const remarks = asNullableString(req.body.remarks);
      const lines = parseLinesInput(req.body.lines);

      if (!Types.ObjectId.isValid(officeId)) {
        throw createHttpError(400, 'officeId is invalid');
      }
      if (!Types.ObjectId.isValid(targetId)) {
        throw createHttpError(400, 'target_id is invalid');
      }

      if (officeId !== ctx.locationId) {
        throw createHttpError(403, 'Access restricted to your assigned office');
      }

      const office: any = await OfficeModel.findById(officeId, { _id: 1 }).lean();
      if (!office) {
        throw createHttpError(404, 'Office not found');
      }

      let requestedByEmployeeId: string | null = null;
      if (targetType === 'EMPLOYEE') {
        const requester: any = await EmployeeModel.findById(targetId, {
          location_id: 1,
          directorate_id: 1,
          office_id: 1,
        }).lean();
        if (!requester) {
          throw createHttpError(404, 'Target employee not found');
        }
        const requesterLocation = requester.location_id ? String(requester.location_id) : null;
        const requesterDirectorate = requester.directorate_id ? String(requester.directorate_id) : null;
        const requesterOffice = (requester as { office_id?: unknown }).office_id
          ? String((requester as { office_id?: unknown }).office_id)
          : null;
        if (requesterLocation !== officeId && requesterDirectorate !== officeId && requesterOffice !== officeId) {
          throw createHttpError(400, 'Target employee must belong to the selected office');
        }
        requestedByEmployeeId = targetId;
      } else {
        const subLocation: any = await OfficeSubLocationModel.findById(targetId, { office_id: 1 }).lean();
        if (!subLocation) {
          throw createHttpError(404, 'Target sub-location not found');
        }
        if (String(subLocation.office_id || '') !== officeId) {
          throw createHttpError(400, 'Target sub-location must belong to the selected office');
        }
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
        requested_by_employee_id: requestedByEmployeeId,
        submitted_by_user_id: ctx.userId,
        fulfilled_by_user_id: null,
        status: 'PENDING_VERIFICATION',
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

      const hqDirectorate = await isHqDirectorateOffice(officeId);
      const allowedRoles = hqDirectorate ? HQ_DIRECTORATE_VERIFIER_ROLES : DISTRICT_LAB_VERIFIER_ROLES;
      if (!allowedRoles.has(ctx.role)) {
        throw createHttpError(403, 'Not permitted to verify requisition for this office type');
      }

      if (!ctx.isOrgAdmin && ctx.locationId !== officeId) {
        throw createHttpError(403, 'Access restricted to assigned office');
      }

      if (requisition.status !== 'PENDING_VERIFICATION') {
        throw createHttpError(400, 'Only pending requisitions can be verified');
      }

      requisition.status = decision === 'VERIFY' ? 'VERIFIED_APPROVED' : 'REJECTED_INVALID';
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

      return res.json(requisition);
    } catch (error) {
      return next(error);
    }
  },
  adjust: async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    try {
      const ctx = await getRequestContext(req);
      const { reason, adjustments } = parseAdjustRequest(req.body);
      const adjustmentsNote = summarizeAdjustmentsForNotes(adjustments);

      let responsePayload: {
        requisition: unknown;
        previousRecord: unknown;
        newRecord: unknown;
        archivedIssueSlipDocumentIds: string[];
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
        if (!allowedRoles.has(ctx.role)) {
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
        requisition.status = 'FULFILLED_PENDING_SIGNATURE';
        requisition.signed_issuance_document_id = null;
        requisition.signed_issuance_uploaded_at = null;
        await requisition.save({ session });

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
      let responsePayload: {
        requisition: unknown;
        record: unknown;
        document: unknown;
        documentVersion: unknown;
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
        if (!allowedRoles.has(ctx.role)) {
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
      if (!allowedRoles.has(ctx.role)) {
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

        const createdAssignments: unknown[] = [];
        const createdDraftAssignmentIds: string[] = [];
        const consumableTransactions: unknown[] = [];

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
              const assetItems = await AssetItemModel.find({ _id: { $in: assignIds } }).session(session);
              if (assetItems.length !== assignIds.length) {
                throw createHttpError(404, `One or more asset items were not found for line ${line.id}`);
              }
              const openAssignments = await AssignmentModel.find(
                {
                  asset_item_id: { $in: assignIds },
                  status: { $in: Array.from(OPEN_ASSIGNMENT_STATUSES) },
                },
                { asset_item_id: 1 }
              ).session(session);
              if (openAssignments.length > 0) {
                const blockedIds = openAssignments
                  .map((row) => (row.asset_item_id ? String(row.asset_item_id) : null))
                  .filter((id): id is string => Boolean(id));
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
                  status: 'DRAFT',
                  assigned_to_type: targetType,
                  assigned_to_id: requisition.target_id,
                  employee_id: targetType === 'EMPLOYEE' ? requisition.target_id : null,
                  requisition_id: requisition._id,
                  requisition_line_id: line._id,
                  assigned_date: new Date(),
                  expected_return_date: null,
                  returned_date: null,
                  notes: `Draft via requisition ${requisition.file_number} line ${line.id}`,
                  is_active: true,
                })),
                { session }
              );

              for (const assignment of assignmentRows) {
                const existingIssueRecord = await RecordModel.findOne({
                  record_type: 'ISSUE',
                  assignment_id: assignment._id,
                }).session(session);
                if (!existingIssueRecord) {
                  await createRecord(
                    ctx,
                    {
                      recordType: 'ISSUE',
                      officeId: issuingOfficeId,
                      status: 'Draft',
                      assetItemId: String(assignment.asset_item_id || ''),
                      employeeId: targetType === 'EMPLOYEE' ? String(requisition.target_id || '') : undefined,
                      assignmentId: String(assignment._id),
                      notes: `Draft via requisition ${requisition.file_number} line ${line.id}`,
                    },
                    session
                  );
                }
              }

              createdAssignments.push(...assignmentRows.map((assignment) => assignment.toJSON()));
              createdDraftAssignmentIds.push(...assignmentRows.map((assignment) => String(assignment._id)));
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
              const item = await ConsumableItemModel.findById(lineConsumableId).session(session);

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
                for (const balance of balances) {
                  if (remainingToIssue <= 0) break;
                  const available = Math.max(Number(balance.qty_on_hand_base || 0), 0);
                  if (available <= 0) continue;
                  const take = Math.min(available, remainingToIssue);
                  if (take <= 0) continue;

                  balance.qty_on_hand_base = available - take;
                  await balance.save({ session });

                  const tx = await ConsumableInventoryTransactionModel.create(
                    [
                      {
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
                      },
                    ],
                    { session }
                  );
                  consumableTransactions.push(tx[0].toJSON());
                  additionalFulfilled += take;
                  remainingToIssue -= take;
                }
              }
            }
          }

          const nextFulfilled = Number(line.fulfilled_quantity || 0) + additionalFulfilled;
          line.fulfilled_quantity = nextFulfilled;
          if (nextFulfilled <= 0) {
            line.status = 'NOT_AVAILABLE';
          } else if (nextFulfilled === approvedQty) {
            line.status = 'ASSIGNED';
          } else {
            line.status = 'PARTIALLY_ASSIGNED';
          }
          await line.save({ session });
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
        requisition.status = allFulfilled ? 'FULFILLED_PENDING_SIGNATURE' : 'PARTIALLY_FULFILLED';
        await requisition.save({ session });

        if (createdDraftAssignmentIds.length > 0) {
          await dispatchDraftAssignmentNotifications({
            officeId: issuingOfficeId,
            requisition,
            assignmentIds: createdDraftAssignmentIds,
          });
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




