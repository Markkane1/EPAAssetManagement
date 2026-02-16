// @ts-nocheck
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Types } from 'mongoose';
import { createHttpError } from '../utils/httpError';
import { AssignmentModel } from '../models/assignment.model';
import { RequisitionModel } from '../models/requisition.model';
import { RequisitionLineModel } from '../models/requisitionLine.model';
import { AssetItemModel } from '../models/assetItem.model';
import { AssetModel } from '../models/asset.model';
import { OfficeModel } from '../models/office.model';
import { EmployeeModel } from '../models/employee.model';
import { OfficeSubLocationModel } from '../models/officeSubLocation.model';
import { DocumentModel } from '../models/document.model';
import { DocumentVersionModel } from '../models/documentVersion.model';
import { DocumentLinkModel } from '../models/documentLink.model';

type GenerateAssignmentSlipParams = {
  assignmentId: string;
  generatedByUserId: string;
};

type GenerateAssignmentSlipResult = {
  documentId: string;
  versionId: string;
  filePath: string;
};

type ResolvedTarget = {
  targetType: 'EMPLOYEE' | 'SUB_LOCATION';
  targetName: string;
};

type LoadedSlipContext = {
  assignment: any;
  requisition: any;
  requisitionLine: any;
  assetItem: any;
  asset: any;
  office: any;
  target: ResolvedTarget;
};

function sanitizeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function asObjectIdString(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Types.ObjectId) return value.toString();
  if (typeof value === 'object') {
    const raw = value as { toHexString?: () => string; toString?: () => string; _id?: unknown };
    if (typeof raw.toHexString === 'function') return raw.toHexString();
    if (raw._id) return asObjectIdString(raw._id);
    if (typeof raw.toString === 'function') {
      const parsed = raw.toString();
      if (parsed && parsed !== '[object Object]') return parsed;
    }
  }
  return null;
}

function displayEmployeeName(employee: { first_name?: string | null; last_name?: string | null; email?: string | null }) {
  const fullName = `${String(employee.first_name || '').trim()} ${String(employee.last_name || '').trim()}`.trim();
  if (fullName) return fullName;
  return String(employee.email || 'Unknown Employee');
}

function getAssignmentShortCode(assignmentId: string) {
  return assignmentId.slice(-6);
}

function wrapText(value: string, maxChars = 78) {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = words[0];
  for (let index = 1; index < words.length; index += 1) {
    const next = `${current} ${words[index]}`;
    if (next.length > maxChars) {
      lines.push(current);
      current = words[index];
    } else {
      current = next;
    }
  }
  lines.push(current);
  return lines;
}

async function resolveTarget(assignment: any, requisition: any): Promise<ResolvedTarget> {
  const assignmentTargetType = String(assignment.assigned_to_type || '').toUpperCase();
  const requisitionTargetType = String(requisition.target_type || '').toUpperCase();

  const targetType =
    assignmentTargetType === 'EMPLOYEE' || assignmentTargetType === 'SUB_LOCATION'
      ? (assignmentTargetType as 'EMPLOYEE' | 'SUB_LOCATION')
      : requisitionTargetType === 'EMPLOYEE' || requisitionTargetType === 'SUB_LOCATION'
        ? (requisitionTargetType as 'EMPLOYEE' | 'SUB_LOCATION')
        : null;

  if (!targetType) {
    throw createHttpError(400, 'Assignment target type is missing');
  }

  const assignmentTargetId = asObjectIdString(assignment.assigned_to_id);
  const assignmentEmployeeId = asObjectIdString(assignment.employee_id);
  const requisitionTargetId = asObjectIdString(requisition.target_id);
  const targetId =
    targetType === 'EMPLOYEE'
      ? assignmentTargetId || assignmentEmployeeId || requisitionTargetId
      : assignmentTargetId || requisitionTargetId;

  if (!targetId) {
    throw createHttpError(400, 'Assignment target id is missing');
  }

  if (targetType === 'EMPLOYEE') {
    const employee = await EmployeeModel.findById(targetId, { first_name: 1, last_name: 1, email: 1 }).lean();
    if (!employee) {
      throw createHttpError(404, 'Target employee not found');
    }
    return {
      targetType,
      targetName: displayEmployeeName(employee),
    };
  }

  const room = await OfficeSubLocationModel.findById(targetId, { name: 1, office_id: 1 }).lean();
  if (!room) {
    throw createHttpError(404, 'Target sub-location not found');
  }

  const requisitionOfficeId = asObjectIdString(requisition.office_id);
  if (requisitionOfficeId && room.office_id && String(room.office_id) !== requisitionOfficeId) {
    throw createHttpError(400, 'Target sub-location office does not match requisition office');
  }

  return {
    targetType,
    targetName: String(room.name || 'Unknown Room'),
  };
}

async function loadSlipContext(assignmentId: string): Promise<LoadedSlipContext> {
  if (!Types.ObjectId.isValid(assignmentId)) {
    throw createHttpError(400, 'assignmentId is invalid');
  }

  const assignment = await AssignmentModel.findById(assignmentId).exec();
  if (!assignment) {
    throw createHttpError(404, 'Assignment not found');
  }

  const requisitionId = asObjectIdString(assignment.requisition_id);
  if (!requisitionId) {
    throw createHttpError(400, 'Assignment requisition is missing');
  }
  const requisitionLineId = asObjectIdString(assignment.requisition_line_id);
  if (!requisitionLineId) {
    throw createHttpError(400, 'Assignment requisition line is missing');
  }
  const assetItemId = asObjectIdString(assignment.asset_item_id);
  if (!assetItemId) {
    throw createHttpError(400, 'Assignment asset item is missing');
  }

  const [requisition, requisitionLine, assetItem] = await Promise.all([
    RequisitionModel.findById(requisitionId).lean(),
    RequisitionLineModel.findById(requisitionLineId).lean(),
    AssetItemModel.findById(assetItemId).lean(),
  ]);

  if (!requisition) {
    throw createHttpError(404, 'Requisition not found');
  }
  if (!requisitionLine) {
    throw createHttpError(404, 'Requisition line not found');
  }
  if (!assetItem) {
    throw createHttpError(404, 'Asset item not found');
  }

  const assetId = asObjectIdString(assetItem.asset_id);
  if (!assetId) {
    throw createHttpError(400, 'Asset item asset reference is missing');
  }
  const officeId = asObjectIdString(requisition.office_id);
  if (!officeId) {
    throw createHttpError(400, 'Requisition office is missing');
  }

  const [asset, office, target] = await Promise.all([
    AssetModel.findById(assetId, { name: 1 }).lean(),
    OfficeModel.findById(officeId, { name: 1 }).lean(),
    resolveTarget(assignment, requisition),
  ]);

  if (!asset) {
    throw createHttpError(404, 'Asset not found');
  }
  if (!office) {
    throw createHttpError(404, 'Office not found');
  }

  return {
    assignment,
    requisition,
    requisitionLine,
    assetItem,
    asset,
    office,
    target,
  };
}

async function renderSlipPdf(input: {
  title: 'Asset Handover Slip' | 'Asset Return Slip';
  slipNo: string;
  fileNumber: string;
  officeName: string;
  assetName: string;
  assetItemTag: string;
  assetItemSerial: string;
  targetLabel: string;
  lineName: string;
  generatedAt: string;
}) {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595.28, 841.89]);

  let y = 795;
  page.drawText(input.title, { x: 40, y, size: 20, font: bold, color: rgb(0.1, 0.1, 0.1) });

  y -= 34;
  const rows = [
    ['Slip No', input.slipNo],
    ['Requisition File No', input.fileNumber],
    ['Office', input.officeName],
    ['Asset', input.assetName],
    ['Asset Item Tag', input.assetItemTag],
    ['Asset Item Serial', input.assetItemSerial],
    ['Target', input.targetLabel],
    ['Requisition Line', input.lineName],
    ['Generated At', input.generatedAt],
  ];

  rows.forEach(([label, value]) => {
    page.drawText(`${label}:`, { x: 40, y, size: 11, font: bold, color: rgb(0, 0, 0) });
    const wrapped = wrapText(String(value || '-'));
    wrapped.forEach((line, index) => {
      page.drawText(line, { x: 185, y: y - index * 14, size: 11, font: regular, color: rgb(0, 0, 0) });
    });
    y -= Math.max(18, wrapped.length * 14 + 4);
  });

  const signatureY = Math.max(130, y - 20);
  page.drawLine({ start: { x: 60, y: signatureY }, end: { x: 250, y: signatureY }, thickness: 1, color: rgb(0, 0, 0) });
  page.drawLine({ start: { x: 330, y: signatureY }, end: { x: 520, y: signatureY }, thickness: 1, color: rgb(0, 0, 0) });
  page.drawText('Caretaker Signature', { x: 90, y: signatureY - 18, size: 10, font: regular });
  page.drawText('Receiver Signature', { x: 365, y: signatureY - 18, size: 10, font: regular });

  return Buffer.from(await doc.save());
}

async function savePdfBuffer(params: { pdfBuffer: Buffer; fileRef: string }) {
  const documentsRoot = path.resolve(process.cwd(), 'uploads', 'documents');
  await fs.mkdir(documentsRoot, { recursive: true });
  const storedFileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${sanitizeFilename(params.fileRef)}.pdf`;
  const absolutePath = path.join(documentsRoot, storedFileName);
  await fs.writeFile(absolutePath, params.pdfBuffer);
  return path.join('uploads', 'documents', storedFileName).replace(/\\/g, '/');
}

async function createDocumentAndVersion(params: {
  title: string;
  docType: 'IssueSlip' | 'ReturnSlip';
  officeId: string;
  generatedByUserId: string;
  assignmentId: string;
  fileLabel: string;
  pdfBuffer: Buffer;
  filePath: string;
}) {
  const document = await DocumentModel.create({
    title: params.title,
    doc_type: params.docType,
    status: 'Draft',
    office_id: params.officeId,
    created_by_user_id: params.generatedByUserId,
  });

  const versionId = new Types.ObjectId();
  const version = await DocumentVersionModel.create({
    _id: versionId,
    document_id: document._id,
    version_no: 1,
    file_name: `${sanitizeFilename(params.fileLabel)}.pdf`,
    mime_type: 'application/pdf',
    size_bytes: params.pdfBuffer.length,
    storage_key: params.filePath,
    file_path: params.filePath,
    file_url: `/api/documents/versions/${versionId.toString()}/download`,
    sha256: crypto.createHash('sha256').update(params.pdfBuffer).digest('hex'),
    uploaded_by_user_id: params.generatedByUserId,
    uploaded_at: new Date(),
  });

  await DocumentLinkModel.create({
    document_id: document._id,
    entity_type: 'Assignment',
    entity_id: params.assignmentId,
    required_for_status: null,
  });

  return {
    document,
    version,
  };
}

function ensureGeneratedByUserId(generatedByUserId: string) {
  if (!Types.ObjectId.isValid(generatedByUserId)) {
    throw createHttpError(400, 'generatedByUserId is invalid');
  }
}

export async function generateHandoverSlip(
  params: GenerateAssignmentSlipParams
): Promise<GenerateAssignmentSlipResult> {
  ensureGeneratedByUserId(params.generatedByUserId);
  const context = await loadSlipContext(params.assignmentId);

  const assignmentId = String(context.assignment._id);
  const requisitionFileNumber = String(context.requisition.file_number || 'N/A');
  const officeId = String(context.requisition.office_id);
  const slipNo = `ASN-HO-${getAssignmentShortCode(assignmentId)}`;
  const generatedAt = new Date().toISOString();
  const pdfBuffer = await renderSlipPdf({
    title: 'Asset Handover Slip',
    slipNo,
    fileNumber: requisitionFileNumber,
    officeName: String(context.office.name || 'Unknown Office'),
    assetName: String(context.asset.name || 'Unknown Asset'),
    assetItemTag: String(context.assetItem.tag || '-'),
    assetItemSerial: String(context.assetItem.serial_number || '-'),
    targetLabel: context.target.targetName,
    lineName: String(context.requisitionLine.requested_name || '-'),
    generatedAt,
  });

  const filePath = await savePdfBuffer({
    pdfBuffer,
    fileRef: `${requisitionFileNumber}-assignment-${assignmentId}-handover-slip`,
  });

  const { document, version } = await createDocumentAndVersion({
    title: `Handover Slip ${slipNo}`,
    docType: 'IssueSlip',
    officeId,
    generatedByUserId: params.generatedByUserId,
    assignmentId,
    fileLabel: `handover-slip-${slipNo}`,
    pdfBuffer,
    filePath,
  });

  await AssignmentModel.updateOne(
    { _id: context.assignment._id },
    {
      $set: {
        handover_slip_document_id: document._id,
        handover_slip_generated_version_id: version._id,
      },
    }
  );

  return {
    documentId: String(document._id),
    versionId: String(version._id),
    filePath,
  };
}

export async function generateReturnSlip(params: GenerateAssignmentSlipParams): Promise<GenerateAssignmentSlipResult> {
  ensureGeneratedByUserId(params.generatedByUserId);
  const context = await loadSlipContext(params.assignmentId);

  const assignmentId = String(context.assignment._id);
  const requisitionFileNumber = String(context.requisition.file_number || 'N/A');
  const officeId = String(context.requisition.office_id);
  const slipNo = `ASN-RT-${getAssignmentShortCode(assignmentId)}`;
  const generatedAt = new Date().toISOString();
  const pdfBuffer = await renderSlipPdf({
    title: 'Asset Return Slip',
    slipNo,
    fileNumber: requisitionFileNumber,
    officeName: String(context.office.name || 'Unknown Office'),
    assetName: String(context.asset.name || 'Unknown Asset'),
    assetItemTag: String(context.assetItem.tag || '-'),
    assetItemSerial: String(context.assetItem.serial_number || '-'),
    targetLabel: context.target.targetName,
    lineName: String(context.requisitionLine.requested_name || '-'),
    generatedAt,
  });

  const filePath = await savePdfBuffer({
    pdfBuffer,
    fileRef: `${requisitionFileNumber}-assignment-${assignmentId}-return-slip`,
  });

  const { document, version } = await createDocumentAndVersion({
    title: `Return Slip ${slipNo}`,
    docType: 'ReturnSlip',
    officeId,
    generatedByUserId: params.generatedByUserId,
    assignmentId,
    fileLabel: `return-slip-${slipNo}`,
    pdfBuffer,
    filePath,
  });

  await AssignmentModel.updateOne(
    { _id: context.assignment._id },
    {
      $set: {
        return_slip_document_id: document._id,
        return_slip_generated_version_id: version._id,
      },
    }
  );

  return {
    documentId: String(document._id),
    versionId: String(version._id),
    filePath,
  };
}

