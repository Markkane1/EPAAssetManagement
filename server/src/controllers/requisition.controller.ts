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

const ALLOWED_SUBMITTER_ROLES = new Set(['employee', 'location_admin', 'caretaker']);
const DISTRICT_LAB_VERIFIER_ROLES = new Set(['location_admin', 'office_head']);
const HQ_DIRECTORATE_VERIFIER_ROLES = new Set(['caretaker', 'assistant_caretaker']);
const DISTRICT_LAB_FULFILLER_ROLES = new Set(['location_admin', 'office_head']);
const HQ_DIRECTORATE_FULFILLER_ROLES = new Set(['caretaker', 'assistant_caretaker']);
const LINE_TYPES = new Set(['MOVEABLE', 'CONSUMABLE']);
const VERIFY_DECISIONS = new Set(['VERIFY', 'REJECT']);
const FULFILL_ALLOWED_STATUSES = new Set(['VERIFIED_APPROVED', 'IN_FULFILLMENT']);
const ADJUST_ALLOWED_STATUSES = new Set(['FULFILLED', 'FULFILLED_PENDING_SIGNATURE']);

type AuthRequestWithFiles = AuthRequest & {
  files?:
    | Express.Multer.File[]
    | {
        [fieldname: string]: Express.Multer.File[];
      };
};

type ParsedLine = {
  line_type: 'MOVEABLE' | 'CONSUMABLE';
  requested_name: string;
  requested_quantity: number;
  approved_quantity: number;
  fulfilled_quantity: number;
  status: 'PENDING_ASSIGNMENT';
  notes: string | null;
};

function asNonEmptyString(value: unknown, fieldName: string) {
  const parsed = String(value ?? '').trim();
  if (!parsed) throw createHttpError(400, `${fieldName} is required`);
  return parsed;
}

function asNullableString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const parsed = String(value).trim();
  if (!parsed || parsed === 'null' || parsed === 'undefined') return null;
  return parsed;
}

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
    const rawType = String(lineObj.lineType ?? lineObj.line_type ?? '').trim().toUpperCase();
    if (!LINE_TYPES.has(rawType)) {
      throw createHttpError(400, `lines[${index}].lineType must be MOVEABLE or CONSUMABLE`);
    }

    const requestedName = asNonEmptyString(
      lineObj.requestedName ?? lineObj.requested_name,
      `lines[${index}].requestedName`
    );
    const requestedQty = asPositiveNumber(
      lineObj.requestedQuantity ?? lineObj.requested_quantity,
      1,
      `lines[${index}].requestedQuantity`
    );
    const approvedQty = asNonNegativeNumber(
      lineObj.approvedQuantity ?? lineObj.approved_quantity,
      requestedQty,
      `lines[${index}].approvedQuantity`
    );
    const notes = asNullableString(lineObj.notes);

    return {
      line_type: rawType as 'MOVEABLE' | 'CONSUMABLE',
      requested_name: requestedName,
      requested_quantity: requestedQty,
      approved_quantity: approvedQty,
      fulfilled_quantity: 0,
      status: 'PENDING_ASSIGNMENT',
      notes,
    };
  });
}

async function isHqDirectorateOffice(officeId: string) {
  const office = await OfficeModel.findById(officeId, {
    is_headoffice: 1,
    parent_location_id: 1,
  }).lean();
  if (!office) throw createHttpError(404, 'Office not found');
  if (office.is_headoffice) return true;
  if (!office.parent_location_id) return false;
  const parent = await OfficeModel.findById(office.parent_location_id, { is_headoffice: 1 }).lean();
  return Boolean(parent?.is_headoffice);
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

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

export const requisitionController = {
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

      const fileNumber = asNonEmptyString(req.body.fileNumber, 'fileNumber');
      const officeId = asNonEmptyString(req.body.officeId, 'officeId');
      const requestedByEmployeeId = asNullableString(req.body.requestedByEmployeeId);
      const remarks = asNullableString(req.body.remarks);
      const lines = parseLinesInput(req.body.lines);

      if (!Types.ObjectId.isValid(officeId)) {
        throw createHttpError(400, 'officeId is invalid');
      }
      if (requestedByEmployeeId && !Types.ObjectId.isValid(requestedByEmployeeId)) {
        throw createHttpError(400, 'requestedByEmployeeId is invalid');
      }

      if (officeId !== ctx.locationId) {
        throw createHttpError(403, 'Access restricted to your assigned office');
      }

      const office = await OfficeModel.findById(officeId, { _id: 1 }).lean();
      if (!office) {
        throw createHttpError(404, 'Office not found');
      }

      if (requestedByEmployeeId) {
        const requester = await EmployeeModel.findById(requestedByEmployeeId, {
          location_id: 1,
          directorate_id: 1,
        }).lean();
        if (!requester) {
          throw createHttpError(404, 'Requested-by employee not found');
        }
        const requesterLocation = requester.location_id ? String(requester.location_id) : null;
        const requesterDirectorate = requester.directorate_id ? String(requester.directorate_id) : null;
        if (requesterLocation !== officeId && requesterDirectorate !== officeId) {
          throw createHttpError(400, 'requestedByEmployeeId must belong to the selected office');
        }
      }

      const existing = await RequisitionModel.findOne({ file_number: fileNumber }, { _id: 1 }).lean();
      if (existing) {
        throw createHttpError(409, 'fileNumber already exists');
      }

      const absolutePath = req.file.path;
      const relativePath = path.join('uploads', 'documents', path.basename(absolutePath));
      const fileBuffer = await fs.readFile(absolutePath);
      const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

      const requisition = await RequisitionModel.create({
        file_number: fileNumber,
        office_id: officeId,
        issuing_office_id: officeId,
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

      const requisitionLinePayload = lines.map((line) => ({
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

      res.status(201).json({
        requisition: requisition.toJSON(),
        lines: lineRows.map((line) => line.toJSON()),
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

      const requisition = await RequisitionModel.findById(req.params.id);
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

      if (!ctx.isHeadoffice && ctx.locationId !== officeId) {
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
        const requisition = await RequisitionModel.findById(req.params.id).session(session);
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
        if (!ctx.isHeadoffice && ctx.locationId !== issuingOfficeId) {
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

      const ctx = await getRequestContext(req);
      let responsePayload: {
        requisition: unknown;
        record: unknown;
        document: unknown;
        documentVersion: unknown;
      } | null = null;

      await session.withTransaction(async () => {
        const requisition = await RequisitionModel.findById(req.params.id).session(session);
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
        if (!ctx.isHeadoffice && ctx.locationId !== issuingOfficeId) {
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
        const lastVersion = await DocumentVersionModel.findOne({ document_id: issueSlipDoc._id }, { version_no: 1 })
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
      const report = await generateAndStoreIssuanceReport(ctx, req.params.id);
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

      const requisition = await RequisitionModel.findById(req.params.id).session(session);
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

      if (!ctx.isHeadoffice && ctx.locationId !== issuingOfficeId) {
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
              if (!requisition.requested_by_employee_id) {
                throw createHttpError(400, 'Moveable fulfillment requires requested_by_employee_id');
              }
              const assetItems = await AssetItemModel.find({ _id: { $in: assignIds } }).session(session);
              if (assetItems.length !== assignIds.length) {
                throw createHttpError(404, `One or more asset items were not found for line ${line.id}`);
              }
              for (const item of assetItems) {
                if (!item.location_id || item.location_id.toString() !== issuingOfficeId) {
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
                  employee_id: requisition.requested_by_employee_id,
                  assigned_date: new Date(),
                  expected_return_date: null,
                  returned_date: null,
                  notes: `Issued via requisition ${requisition.file_number} line ${line.id}`,
                  is_active: true,
                })),
                { session }
              );
              createdAssignments.push(...assignmentRows.map((assignment) => assignment.toJSON()));

              await AssetItemModel.updateMany(
                { _id: { $in: assignIds } },
                { assignment_status: 'Assigned', item_status: 'Assigned' },
                { session }
              );
              additionalFulfilled = assignIds.length;
            }
          } else if (line.line_type === 'CONSUMABLE') {
            const requestedIssue = Math.max(Number(payloadLine.issuedQuantity || 0), 0);
            if (requestedIssue > 0 && remainingQty <= 0) {
              throw createHttpError(400, `Consumable line ${line.id} is already fully fulfilled`);
            }

            const issueCap = Math.min(requestedIssue, remainingQty);
            if (issueCap > 0) {
              const item = await ConsumableItemModel.findOne({
                name: { $regex: `^${escapeRegex(line.requested_name)}$`, $options: 'i' },
              }).session(session);

              if (item) {
                const balances = await ConsumableInventoryBalanceModel.find({
                  location_id: issuingOfficeId,
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
                        from_location_id: issuingOfficeId,
                        to_location_id: null,
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
          } else if (nextFulfilled >= approvedQty) {
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
          return Number(line.fulfilled_quantity || 0) >= approved && approved > 0;
        });

        requisition.fulfilled_by_user_id = ctx.userId as any;
        requisition.status = allFulfilled ? 'FULFILLED_PENDING_SIGNATURE' : 'PARTIALLY_FULFILLED';
        await requisition.save({ session });

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

        const responseLines = finalLines.map((line) => line.toJSON());
        responsePayload = {
          requisition: requisition.toJSON(),
          lines: responseLines,
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
