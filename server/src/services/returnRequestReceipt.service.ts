import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Types, type ClientSession } from 'mongoose';
import { DocumentModel } from '../models/document.model';
import { DocumentVersionModel } from '../models/documentVersion.model';
import { DocumentLinkModel } from '../models/documentLink.model';

type ReturnReceiptLine = {
  assetItemId: string;
  assetName: string;
  tag: string;
  serialNumber: string;
};

type GenerateReturnReceiptParams = {
  session: ClientSession;
  officeId: string;
  officeName: string;
  employeeName: string;
  returnRequestId: string;
  recordId: string;
  createdByUserId: string;
  lines: ReturnReceiptLine[];
};

function sanitizeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

async function renderReturnReceiptPdf(params: {
  officeName: string;
  employeeName: string;
  returnRequestId: string;
  lines: ReturnReceiptLine[];
}) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([842, 595]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let y = 560;
  page.drawText('Return Receipt (Draft)', { x: 40, y, size: 18, font: bold, color: rgb(0.1, 0.1, 0.1) });
  y -= 30;
  page.drawText(`Return Request: ${params.returnRequestId}`, { x: 40, y, size: 11, font });
  y -= 16;
  page.drawText(`Office: ${params.officeName}`, { x: 40, y, size: 11, font });
  y -= 16;
  page.drawText(`Employee: ${params.employeeName}`, { x: 40, y, size: 11, font });
  y -= 16;
  page.drawText(`Generated At: ${new Date().toISOString()}`, { x: 40, y, size: 11, font });

  y -= 26;
  page.drawText('No.', { x: 40, y, size: 10, font: bold });
  page.drawText('Asset Item ID', { x: 90, y, size: 10, font: bold });
  page.drawText('Asset Name', { x: 250, y, size: 10, font: bold });
  page.drawText('Tag', { x: 470, y, size: 10, font: bold });
  page.drawText('Serial', { x: 560, y, size: 10, font: bold });
  y -= 8;
  page.drawLine({ start: { x: 40, y }, end: { x: 800, y }, thickness: 1, color: rgb(0.5, 0.5, 0.5) });
  y -= 16;

  for (let index = 0; index < params.lines.length; index += 1) {
    const line = params.lines[index];
    if (y < 40) break;
    page.drawText(String(index + 1), { x: 40, y, size: 9, font });
    page.drawText(line.assetItemId, { x: 90, y, size: 9, font });
    page.drawText(line.assetName || '-', { x: 250, y, size: 9, font });
    page.drawText(line.tag || '-', { x: 470, y, size: 9, font });
    page.drawText(line.serialNumber || '-', { x: 560, y, size: 9, font });
    y -= 14;
  }

  return Buffer.from(await pdf.save());
}

export async function generateAndStoreReturnReceipt(params: GenerateReturnReceiptParams) {
  const pdfBuffer = await renderReturnReceiptPdf({
    officeName: params.officeName,
    employeeName: params.employeeName,
    returnRequestId: params.returnRequestId,
    lines: params.lines,
  });

  const documentsRoot = path.resolve(process.cwd(), 'uploads', 'documents');
  await fs.mkdir(documentsRoot, { recursive: true });
  const fileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${sanitizeFilename(
    params.returnRequestId
  )}-return-receipt.pdf`;
  const absolutePath = path.join(documentsRoot, fileName);
  await fs.writeFile(absolutePath, pdfBuffer);
  const relativePath = path.join('uploads', 'documents', fileName).replace(/\\/g, '/');

  const document = await DocumentModel.create(
    [
      {
        title: `Return Receipt ${params.returnRequestId}`,
        doc_type: 'ReturnSlip',
        status: 'Draft',
        office_id: params.officeId,
        created_by_user_id: params.createdByUserId,
      },
    ],
    { session: params.session }
  ).then((rows) => rows[0]);

  const versionId = new Types.ObjectId();
  const version = await DocumentVersionModel.create(
    [
      {
        _id: versionId,
        document_id: document._id,
        version_no: 1,
        file_name: `return-receipt-${sanitizeFilename(params.returnRequestId)}.pdf`,
        mime_type: 'application/pdf',
        size_bytes: pdfBuffer.length,
        storage_key: relativePath,
        file_path: relativePath,
        file_url: `/api/documents/versions/${versionId.toString()}/download`,
        sha256: crypto.createHash('sha256').update(pdfBuffer).digest('hex'),
        uploaded_by_user_id: params.createdByUserId,
        uploaded_at: new Date(),
      },
    ],
    { session: params.session }
  ).then((rows) => rows[0]);

  await DocumentLinkModel.create(
    [
      {
        document_id: document._id,
        entity_type: 'Record',
        entity_id: params.recordId,
        required_for_status: 'Completed',
      },
    ],
    { session: params.session }
  );

  return {
    document,
    version,
  };
}
