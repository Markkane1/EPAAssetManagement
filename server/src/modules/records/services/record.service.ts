import type { ClientSession } from 'mongoose';
import { RecordModel } from '../../../models/record.model';
import { DocumentLinkModel } from '../../../models/documentLink.model';
import { DocumentModel } from '../../../models/document.model';
import { ApprovalRequestModel } from '../../../models/approvalRequest.model';
import { createHttpError } from '../../../utils/httpError';
import { buildOfficeFilter, RequestContext } from '../../../utils/scope';
import { generateReference } from '../utils/reference';
import { ALLOWED_TRANSITIONS, APPROVAL_REQUIRED, REQUIRED_DOCUMENTS, RecordStatus } from '../utils/transitions';
import { logAudit } from './audit.service';

export interface RecordCreateInput {
  recordType: string;
  officeId?: string;
  status?: RecordStatus;
  assetItemId?: string;
  employeeId?: string;
  assignmentId?: string;
  transferId?: string;
  maintenanceRecordId?: string;
  notes?: string;
}

interface PaginationOptions {
  page?: number;
  limit?: number;
}

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export async function createRecord(
  ctx: RequestContext,
  input: RecordCreateInput,
  session?: ClientSession
) {
  const officeId = input.officeId || ctx.locationId;
  if (!officeId) throw createHttpError(400, 'Office is required for record');

  if (!ctx.isHeadoffice && officeId !== ctx.locationId) {
    throw createHttpError(403, 'Access restricted to assigned office');
  }

  const referenceNo = await generateReference(input.recordType, officeId, session);

  const record = await RecordModel.create(
    [
      {
        record_type: input.recordType,
        reference_no: referenceNo,
        office_id: officeId,
        status: input.status || 'Draft',
        created_by_user_id: ctx.userId,
        asset_item_id: input.assetItemId || null,
        employee_id: input.employeeId || null,
        assignment_id: input.assignmentId || null,
        transfer_id: input.transferId || null,
        maintenance_record_id: input.maintenanceRecordId || null,
        notes: input.notes || null,
      },
    ],
    { session }
  );

  await logAudit({
    ctx,
    action: 'CREATE_RECORD',
    entityType: 'Record',
    entityId: record[0].id,
    officeId,
    diff: { recordType: input.recordType, status: input.status || 'Draft' },
    session,
  });

  return record[0];
}

export async function listRecords(
  ctx: RequestContext,
  filters: Record<string, unknown>,
  pagination: PaginationOptions = {}
) {
  const limit = clampInt(pagination.limit, 500, 1, 2000);
  const page = clampInt(pagination.page, 1, 1, 100000);
  const skip = (page - 1) * limit;
  const query: Record<string, unknown> = { ...filters };
  const officeFilter = buildOfficeFilter(ctx, 'office_id');
  if (officeFilter) Object.assign(query, officeFilter);

  return RecordModel.find(query).sort({ created_at: -1 }).skip(skip).limit(limit).lean();
}

export async function getRecordById(ctx: RequestContext, id: string) {
  const record = await RecordModel.findById(id).lean();
  if (!record) throw createHttpError(404, 'Record not found');
  if (!ctx.isHeadoffice && String((record as { office_id?: unknown }).office_id) !== ctx.locationId) {
    throw createHttpError(403, 'Access restricted to assigned office');
  }
  return record;
}

async function hasRequiredDocs(
  recordId: string,
  requirements: string[][],
  relatedMaintenanceId?: string | null
) {
  if (requirements.length === 0) return true;
  const entityFilters: Array<{ entity_type: string; entity_id: string }> = [
    { entity_type: 'Record', entity_id: recordId },
  ];
  if (relatedMaintenanceId) {
    entityFilters.push({ entity_type: 'MaintenanceRecord', entity_id: relatedMaintenanceId });
  }
  const links = await DocumentLinkModel.find({
    $or: entityFilters,
  }, { document_id: 1 }).lean();

  const docIds = links
    .map((link) => String((link as { document_id?: unknown }).document_id || ''))
    .filter(Boolean);
  if (docIds.length === 0) return false;
  const documents = await DocumentModel.find({ _id: { $in: docIds } }, { doc_type: 1 }).lean();
  const docTypes = new Set(documents.map((doc) => String(doc.doc_type || '')).filter(Boolean));

  return requirements.every((group) => group.some((type) => docTypes.has(type)));
}

async function hasApprovedApproval(recordId: string) {
  const approved = await ApprovalRequestModel.exists({ record_id: recordId, status: 'Approved' });
  return Boolean(approved);
}

export async function updateRecordStatus(
  ctx: RequestContext,
  recordId: string,
  status: RecordStatus,
  notes?: string,
  session?: ClientSession
) {
  const record = await RecordModel.findById(recordId).session(session || null);
  if (!record) throw createHttpError(404, 'Record not found');
  const recordDoc = record as any;
  if (!ctx.isHeadoffice && recordDoc.office_id.toString() !== ctx.locationId) {
    throw createHttpError(403, 'Access restricted to assigned office');
  }

  const currentStatus = String(recordDoc.status) as RecordStatus;
  const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(status)) {
    throw createHttpError(400, `Invalid status transition from ${currentStatus} to ${status}`);
  }

  const recordType = String(recordDoc.record_type);
  const relatedMaintenanceId =
    recordType === 'MAINTENANCE' && recordDoc.maintenance_record_id
      ? recordDoc.maintenance_record_id.toString()
      : null;
  const approvalRequired = (APPROVAL_REQUIRED[recordType] || []).includes(status);
  if (approvalRequired && !ctx.isHeadoffice) {
    const approved = await hasApprovedApproval(recordDoc.id);
    if (!approved) throw createHttpError(400, 'Approval required before this status transition');
  }

  const requiredDocs = REQUIRED_DOCUMENTS[recordType]?.[status] || [];
  if (requiredDocs.length > 0) {
    const ok = await hasRequiredDocs(recordDoc.id, requiredDocs, relatedMaintenanceId);
    if (!ok) throw createHttpError(400, 'Required document missing for this status');
  }

  const previousStatus = recordDoc.status;
  recordDoc.status = status;
  if (notes) recordDoc.notes = notes;
  await recordDoc.save({ session });

  await logAudit({
    ctx,
    action: 'STATUS_CHANGE',
    entityType: 'Record',
    entityId: recordDoc.id,
    officeId: recordDoc.office_id.toString(),
    diff: { from: previousStatus, to: status },
    session,
  });

  return recordDoc;
}

export async function listRegister(
  ctx: RequestContext,
  recordType: string,
  from?: string,
  to?: string,
  officeId?: string,
  pagination: PaginationOptions = {}
) {
  const limit = clampInt(pagination.limit, 500, 1, 2000);
  const page = clampInt(pagination.page, 1, 1, 100000);
  const skip = (page - 1) * limit;
  const query: Record<string, unknown> = { record_type: recordType };
  const officeFilter = buildOfficeFilter(ctx, 'office_id');

  if (officeFilter) {
    Object.assign(query, officeFilter);
  } else if (officeId) {
    query.office_id = officeId;
  }

  if (from || to) {
    query.created_at = {} as Record<string, unknown>;
    if (from) (query.created_at as Record<string, unknown>).$gte = new Date(from);
    if (to) (query.created_at as Record<string, unknown>).$lte = new Date(to);
  }

  return RecordModel.find(query)
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(limit)
    .populate('asset_item_id')
    .populate('employee_id')
    .populate('assignment_id')
    .populate('transfer_id')
    .populate('maintenance_record_id');
}

export async function ensureDocumentOwnership(recordId: string, docType: string) {
  const links = await DocumentLinkModel.find({
    entity_type: 'Record',
    entity_id: recordId,
  }, { document_id: 1 }).lean();

  const docIds = links
    .map((link) => String((link as { document_id?: unknown }).document_id || ''))
    .filter(Boolean);
  if (docIds.length === 0) return false;
  const matched = await DocumentModel.exists({ _id: { $in: docIds }, doc_type: docType });
  return Boolean(matched);
}

export async function attachDocumentToRecord(recordId: string, documentId: string, requiredForStatus?: RecordStatus) {
  const document = await DocumentModel.findById(documentId);
  if (!document) throw createHttpError(404, 'Document not found');

  return DocumentLinkModel.create({
    document_id: documentId,
    entity_type: 'Record',
    entity_id: recordId,
    required_for_status: requiredForStatus || null,
  });
}
