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

export async function listRecords(ctx: RequestContext, filters: Record<string, unknown>) {
  const query: Record<string, unknown> = { ...filters };
  const officeFilter = buildOfficeFilter(ctx, 'office_id');
  if (officeFilter) Object.assign(query, officeFilter);

  return RecordModel.find(query).sort({ created_at: -1 });
}

export async function getRecordById(ctx: RequestContext, id: string) {
  const record = await RecordModel.findById(id);
  if (!record) throw createHttpError(404, 'Record not found');
  const recordDoc = record as any;
  if (!ctx.isHeadoffice && recordDoc.office_id.toString() !== ctx.locationId) {
    throw createHttpError(403, 'Access restricted to assigned office');
  }
  return recordDoc;
}

async function hasRequiredDocs(recordId: string, requirements: string[][]) {
  if (requirements.length === 0) return true;
  const links = await DocumentLinkModel.find({
    entity_type: 'Record',
    entity_id: recordId,
  }).populate('document_id');

  const docTypes = new Set(
    links
      .map((link) => (link.document_id as any)?.doc_type)
      .filter(Boolean)
  );

  return requirements.every((group) => group.some((type) => docTypes.has(type)));
}

async function hasApprovedApproval(recordId: string) {
  const approved = await ApprovalRequestModel.findOne({ record_id: recordId, status: 'Approved' });
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
  const approvalRequired = (APPROVAL_REQUIRED[recordType] || []).includes(status);
  if (approvalRequired && !ctx.isHeadoffice) {
    const approved = await hasApprovedApproval(recordDoc.id);
    if (!approved) throw createHttpError(400, 'Approval required before this status transition');
  }

  const requiredDocs = REQUIRED_DOCUMENTS[recordType]?.[status] || [];
  if (requiredDocs.length > 0) {
    const ok = await hasRequiredDocs(recordDoc.id, requiredDocs);
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
  officeId?: string
) {
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
  }).populate('document_id');

  return links.some((link) => (link.document_id as any)?.doc_type === docType);
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
