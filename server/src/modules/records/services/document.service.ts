import path from 'path';
import crypto from 'crypto';
import fs from 'fs/promises';
import { Types, type ClientSession } from 'mongoose';
import type { Express } from 'express';
import { DocumentModel } from '../../../models/document.model';
import { DocumentVersionModel } from '../../../models/documentVersion.model';
import { createHttpError } from '../../../utils/httpError';
import { buildOfficeFilter, RequestContext } from '../../../utils/scope';
import { logAudit } from './audit.service';

export interface DocumentCreateInput {
  title: string;
  docType: string;
  status?: string;
  officeId?: string;
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

export async function createDocument(ctx: RequestContext, input: DocumentCreateInput, session?: ClientSession) {
  const officeId = input.officeId || ctx.locationId;
  if (!officeId) throw createHttpError(400, 'Office is required for document');
  if (!ctx.isHeadoffice && officeId !== ctx.locationId) {
    throw createHttpError(403, 'Access restricted to assigned office');
  }

  const document = await DocumentModel.create(
    [
      {
        title: input.title,
        doc_type: input.docType,
        status: input.status || 'Draft',
        office_id: officeId,
        created_by_user_id: ctx.userId,
      },
    ],
    { session }
  );

  await logAudit({
    ctx,
    action: 'CREATE_DOCUMENT',
    entityType: 'Document',
    entityId: document[0].id,
    officeId,
    diff: { docType: input.docType },
    session,
  });

  return document[0];
}

export async function listDocuments(
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
  return DocumentModel.find(query).sort({ created_at: -1 }).skip(skip).limit(limit).lean();
}

export async function getDocumentById(ctx: RequestContext, id: string) {
  const document = await DocumentModel.findById(id).lean();
  if (!document) throw createHttpError(404, 'Document not found');
  if (!ctx.isHeadoffice && String((document as { office_id?: unknown }).office_id) !== ctx.locationId) {
    throw createHttpError(403, 'Access restricted to assigned office');
  }
  return document;
}

export async function uploadDocumentVersion(
  ctx: RequestContext,
  documentId: string,
  file: Express.Multer.File
) {
  const document = await DocumentModel.findById(documentId, { office_id: 1 }).lean();
  if (!document) throw createHttpError(404, 'Document not found');
  if (!ctx.isHeadoffice && String((document as { office_id?: unknown }).office_id) !== ctx.locationId) {
    throw createHttpError(403, 'Access restricted to assigned office');
  }

  const lastVersion = await DocumentVersionModel.findOne({ document_id: documentId }, { version_no: 1 })
    .sort({ version_no: -1 })
    .lean()
    .exec();
  const nextVersion = lastVersion && typeof lastVersion.version_no === 'number' ? lastVersion.version_no + 1 : 1;

  const fileBuffer = await fs.readFile(file.path);
  const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  const relativePath = path.join('uploads', 'documents', path.basename(file.path));
  const versionId = new Types.ObjectId();
  const fileUrl = `/api/documents/versions/${versionId.toString()}/download`;

  const version = await DocumentVersionModel.create({
    _id: versionId,
    document_id: documentId,
    version_no: nextVersion,
    file_name: file.originalname,
    mime_type: file.mimetype,
    size_bytes: file.size,
    storage_key: relativePath,
    file_path: relativePath,
    file_url: fileUrl,
    sha256,
    uploaded_by_user_id: ctx.userId,
    uploaded_at: new Date(),
  });

  await logAudit({
    ctx,
    action: 'UPLOAD_DOCUMENT',
    entityType: 'Document',
    entityId: documentId,
    officeId: String((document as { office_id?: unknown }).office_id || ''),
    diff: { version: nextVersion },
  });

  return version;
}

export async function getDocumentVersionDownload(ctx: RequestContext, versionId: string) {
  const version = await DocumentVersionModel.findById(versionId).lean();
  if (!version) throw createHttpError(404, 'Document version not found');

  const document = await DocumentModel.findById(version.document_id, { office_id: 1 }).lean();
  if (!document) throw createHttpError(404, 'Document not found');
  if (!ctx.isHeadoffice && String((document as { office_id?: unknown }).office_id) !== ctx.locationId) {
    throw createHttpError(403, 'Access restricted to assigned office');
  }

  const storageKey = String(version.storage_key || version.file_path || '');
  if (!storageKey) throw createHttpError(404, 'File not found');

  const uploadsRoot = path.resolve(process.cwd(), 'uploads');
  const absolutePath = path.resolve(process.cwd(), storageKey);
  if (!absolutePath.startsWith(uploadsRoot)) {
    throw createHttpError(400, 'Invalid file path');
  }

  return {
    version,
    absolutePath,
  };
}
