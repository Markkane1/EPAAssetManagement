import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Types } from 'mongoose';
import type { RequestContext } from '../utils/scope';
import { createHttpError } from '../utils/httpError';
import { RequisitionModel } from '../models/requisition.model';
import { RequisitionLineModel } from '../models/requisitionLine.model';
import { OfficeModel } from '../models/office.model';
import { AssignmentModel } from '../models/assignment.model';
import { AssetItemModel } from '../models/assetItem.model';
import { AssetModel } from '../models/asset.model';
import { DocumentModel } from '../models/document.model';
import { DocumentLinkModel } from '../models/documentLink.model';
import { DocumentVersionModel } from '../models/documentVersion.model';
import { logAudit } from '../modules/records/services/audit.service';

type AssignmentWithDetails = {
  id: string;
  notes: string | null;
  assignedDate: string;
  assetItemId: string | null;
  tag: string | null;
  serialNumber: string | null;
  assetName: string;
};

type ReportLine = {
  lineNo: number;
  lineId: string;
  lineType: 'MOVEABLE' | 'CONSUMABLE';
  requestedName: string;
  requestedQuantity: number;
  approvedQuantity: number;
  issuedQuantity: number;
  status: string;
  assignedItems: AssignmentWithDetails[];
};

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function safeFilename(value: string, fallback = 'requisition') {
  const sanitized = value.replace(/[^a-zA-Z0-9-_]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  return sanitized || fallback;
}

function toIdString(value: unknown, seen = new Set<unknown>()): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    if (seen.has(value)) return null;
    seen.add(value);
    const raw = value as {
      _id?: unknown;
      id?: unknown;
      toString?: () => string;
      toHexString?: () => string;
    };
    if (typeof raw.toHexString === 'function') {
      return raw.toHexString();
    }
    if (raw._id !== undefined && raw._id !== value) {
      const parsed = toIdString(raw._id, seen);
      if (parsed) return parsed;
    }
    if (raw.id !== undefined && raw.id !== value) {
      const parsed = toIdString(raw.id, seen);
      if (parsed) return parsed;
    }
    if (typeof raw.toString === 'function') {
      const parsed = raw.toString();
      if (parsed && parsed !== '[object Object]') return parsed;
    }
  }
  return null;
}

function docId(doc: unknown): string | null {
  return toIdString((doc as { id?: unknown; _id?: unknown })?.id) ||
    toIdString((doc as { id?: unknown; _id?: unknown })?._id);
}

function approvedQty(line: { requested_quantity?: number | null; approved_quantity?: number | null }) {
  if (line.approved_quantity === null || line.approved_quantity === undefined) {
    return Number(line.requested_quantity || 0);
  }
  return Number(line.approved_quantity || 0);
}

function toDateString(value?: Date | string | null) {
  if (!value) return 'N/A';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 10);
}

function wrapText(text: string, maxChars = 95) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i += 1) {
    const next = `${current} ${words[i]}`;
    if (next.length > maxChars) {
      lines.push(current);
      current = words[i];
    } else {
      current = next;
    }
  }
  lines.push(current);
  return lines;
}

async function buildLineReports(requisition: any, lines: any[]) {
  const reportLines: ReportLine[] = [];
  const requestedByEmployeeId = requisition.requested_by_employee_id?.toString() || null;

  let candidateAssignments: any[] = [];
  if (requestedByEmployeeId) {
    const requisitionRegex = new RegExp(`Requisition\\s+${escapeRegex(requisition.file_number)}`, 'i');
    candidateAssignments = await AssignmentModel.find({
      employee_id: requestedByEmployeeId,
      notes: { $regex: requisitionRegex },
    })
      .sort({ assigned_date: 1, created_at: 1 })
      .lean();
  }

  const assetItemIds = candidateAssignments
    .map((assignment) => assignment.asset_item_id?.toString())
    .filter((id): id is string => Boolean(id));
  const assetItems = assetItemIds.length
    ? await AssetItemModel.find({ _id: { $in: assetItemIds } }, { asset_id: 1, tag: 1, serial_number: 1 }).lean()
    : [];
  const itemById = new Map(
    assetItems
      .map((item) => [docId(item), item] as const)
      .filter(([id]) => Boolean(id)) as Array<[string, any]>
  );
  const assetIds = assetItems
    .map((item) => item.asset_id?.toString())
    .filter((id): id is string => Boolean(id));
  const assets = assetIds.length ? await AssetModel.find({ _id: { $in: assetIds } }, { name: 1 }).lean() : [];
  const assetById = new Map(
    assets
      .map((asset) => [docId(asset), asset] as const)
      .filter(([id]) => Boolean(id)) as Array<[string, any]>
  );

  const assignmentsWithDetails: AssignmentWithDetails[] = candidateAssignments.map((assignment) => {
    const item = assignment.asset_item_id ? itemById.get(toIdString(assignment.asset_item_id) || '') : null;
    const asset = item?.asset_id ? assetById.get(String(item.asset_id)) : null;
    const assignmentId =
      docId(assignment) ||
      `${toIdString(assignment.asset_item_id) || 'assignment'}:${toDateString(assignment.assigned_date)}:${String(assignment.notes || '')}`;
    return {
      id: assignmentId,
      notes: assignment.notes || null,
      assignedDate: toDateString(assignment.assigned_date),
      assetItemId: docId(item),
      tag: item?.tag || null,
      serialNumber: item?.serial_number || null,
      assetName: asset?.name || 'Unknown Asset',
    };
  });

  const usedAssignmentIds = new Set<string>();

  lines.forEach((line, index) => {
    const requestedQuantity = Number(line.requested_quantity || 0);
    const approvedQuantity = approvedQty(line);
    const issuedQuantity = Number(line.fulfilled_quantity || 0);
    let assignedItems: AssignmentWithDetails[] = [];

    if (line.line_type === 'MOVEABLE') {
      const lineId = docId(line) || '';
      const lineRegex = new RegExp(`line\\s+${escapeRegex(lineId)}\\b`, 'i');
      const requestedNameNorm = normalizeText(String(line.requested_name || ''));
      const expectedCount = Math.max(Math.floor(issuedQuantity), 0);

      const explicit = assignmentsWithDetails.filter(
        (assignment) =>
          !usedAssignmentIds.has(assignment.id) &&
          Boolean(assignment.notes) &&
          lineRegex.test(String(assignment.notes))
      );

      if (explicit.length > 0) {
        assignedItems = explicit.slice(0, expectedCount || explicit.length);
      } else {
        const fallback = assignmentsWithDetails.filter((assignment) => {
          if (usedAssignmentIds.has(assignment.id)) return false;
          return normalizeText(assignment.assetName) === requestedNameNorm;
        });
        assignedItems = fallback.slice(0, expectedCount || fallback.length);
      }

      assignedItems.forEach((assignment) => usedAssignmentIds.add(assignment.id));
    }

    reportLines.push({
      lineNo: index + 1,
      lineId: docId(line) || '',
      lineType: line.line_type,
      requestedName: String(line.requested_name || ''),
      requestedQuantity,
      approvedQuantity,
      issuedQuantity,
      status: String(line.status || ''),
      assignedItems,
    });
  });

  return reportLines;
}

async function renderIssuanceReportPdf(input: {
  fileNumber: string;
  officeName: string;
  requisitionStatus: string;
  reportLines: ReportLine[];
}) {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([595.28, 841.89]);
  let y = 805;

  const drawLine = (text: string, opts?: { size?: number; isBold?: boolean; color?: [number, number, number] }) => {
    const fontSize = opts?.size ?? 10;
    const font = opts?.isBold ? bold : regular;
    const color = opts?.color ? rgb(opts.color[0], opts.color[1], opts.color[2]) : rgb(0, 0, 0);

    const wrapped = wrapText(text, 95);
    wrapped.forEach((lineText) => {
      if (y < 55) {
        page = doc.addPage([595.28, 841.89]);
        y = 805;
      }
      page.drawText(lineText, {
        x: 40,
        y,
        size: fontSize,
        font,
        color,
      });
      y -= fontSize + 5;
    });
  };

  drawLine('Issuance Report', { size: 16, isBold: true });
  drawLine(`File Number: ${input.fileNumber}`, { size: 11, isBold: true });
  drawLine(`Office: ${input.officeName}`, { size: 11 });
  drawLine(`Requisition Status: ${input.requisitionStatus}`, { size: 11 });
  drawLine(`Generated At: ${new Date().toISOString()}`, { size: 10 });
  y -= 6;

  input.reportLines.forEach((line) => {
    drawLine(`Line ${line.lineNo} [${line.lineType}] ${line.requestedName}`, { size: 11, isBold: true });
    drawLine(
      `Requested: ${line.requestedQuantity} | Approved: ${line.approvedQuantity} | Issued: ${line.issuedQuantity} | Status: ${line.status}`,
      { size: 10 }
    );

    if (line.lineType === 'MOVEABLE') {
      if (line.assignedItems.length === 0) {
        drawLine('Assigned Asset Items: None', { size: 10 });
      } else {
        drawLine('Assigned Asset Items:', { size: 10, isBold: true });
        line.assignedItems.forEach((assignment, idx) => {
          const assetLabel = assignment.assetName || 'Unknown Asset';
          const tagLabel = assignment.tag ? `Tag: ${assignment.tag}` : 'Tag: N/A';
          const serialLabel = assignment.serialNumber ? `Serial: ${assignment.serialNumber}` : 'Serial: N/A';
          drawLine(
            `${idx + 1}. ${assetLabel} | ${tagLabel} | ${serialLabel} | Assigned On: ${assignment.assignedDate}`,
            { size: 9 }
          );
        });
      }
    }

    y -= 4;
  });

  return Buffer.from(await doc.save());
}

export async function generateAndStoreIssuanceReport(ctx: RequestContext, requisitionId: string) {
  const requisition = await RequisitionModel.findById(requisitionId).lean();
  if (!requisition) {
    throw createHttpError(404, 'Requisition not found');
  }

  const officeId = requisition.office_id?.toString();
  if (!officeId) {
    throw createHttpError(400, 'Requisition office is missing');
  }
  if (!ctx.isHeadoffice && ctx.locationId !== officeId) {
    throw createHttpError(403, 'Access restricted to assigned office');
  }

  const office = await OfficeModel.findById(officeId, { name: 1 }).lean();
  if (!office) {
    throw createHttpError(404, 'Office not found');
  }

  const lines = await RequisitionLineModel.find({ requisition_id: requisitionId }).sort({ created_at: 1 }).lean();
  const reportLines = await buildLineReports(requisition, lines);
  const pdfBuffer = await renderIssuanceReportPdf({
    fileNumber: String(requisition.file_number || ''),
    officeName: String(office.name || 'Unknown Office'),
    requisitionStatus: String(requisition.status || ''),
    reportLines,
  });

  const uploadsRoot = path.resolve(process.cwd(), 'uploads');
  const documentsRoot = path.join(uploadsRoot, 'documents');
  await fs.mkdir(documentsRoot, { recursive: true });

  const safeFileRef = safeFilename(String(requisition.file_number || 'requisition'));
  const storedFileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeFileRef}-issuance-report.pdf`;
  const absolutePath = path.join(documentsRoot, storedFileName);
  await fs.writeFile(absolutePath, pdfBuffer);
  const relativePath = path.join('uploads', 'documents', storedFileName).replace(/\\/g, '/');

  const requisitionLinks = await DocumentLinkModel.find(
    { entity_type: 'Requisition', entity_id: requisition._id },
    { document_id: 1 }
  ).lean();
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
        .exec()
    : null;

  if (!issueSlipDoc) {
    issueSlipDoc = await DocumentModel.create({
      title: `Issue Slip ${requisition.file_number}`,
      doc_type: 'IssueSlip',
      status: 'Draft',
      office_id: officeId,
      created_by_user_id: ctx.userId,
    });
    await DocumentLinkModel.create({
      document_id: issueSlipDoc._id,
      entity_type: 'Requisition',
      entity_id: requisition._id,
      required_for_status: null,
    });
  } else if (issueSlipDoc.status !== 'Draft') {
    issueSlipDoc.status = 'Draft';
    await issueSlipDoc.save();
  }

  const lastVersion = await DocumentVersionModel.findOne({ document_id: issueSlipDoc._id }, { version_no: 1 })
    .sort({ version_no: -1 })
    .lean()
    .exec();
  const nextVersion = lastVersion && typeof lastVersion.version_no === 'number' ? lastVersion.version_no + 1 : 1;

  const versionId = new Types.ObjectId();
  const sha256 = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
  const documentVersion = await DocumentVersionModel.create({
    _id: versionId,
    document_id: issueSlipDoc._id,
    version_no: nextVersion,
    file_name: `issuance-report-${safeFileRef}.pdf`,
    mime_type: 'application/pdf',
    size_bytes: pdfBuffer.length,
    storage_key: relativePath,
    file_path: relativePath,
    file_url: `/api/documents/versions/${versionId.toString()}/download`,
    sha256,
    uploaded_by_user_id: ctx.userId,
    uploaded_at: new Date(),
  });

  await logAudit({
    ctx,
    action: 'GENERATE_ISSUANCE_REPORT',
    entityType: 'Requisition',
    entityId: docId(requisition) || requisitionId,
    officeId,
    diff: {
      documentId: docId(issueSlipDoc) || '',
      versionNo: nextVersion,
      lineCount: reportLines.length,
    },
  });

  return {
    buffer: pdfBuffer,
    downloadFileName: `issuance-report-${safeFileRef}.pdf`,
    documentId: docId(issueSlipDoc) || '',
    versionId: docId(documentVersion) || '',
  };
}
