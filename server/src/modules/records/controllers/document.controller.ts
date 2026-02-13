import { Response, NextFunction } from 'express';
import type { AuthRequest } from '../../../middleware/auth';
import { getRequestContext } from '../../../utils/scope';
import {
  createDocument,
  getDocumentById,
  getDocumentVersionDownload,
  listDocuments,
  uploadDocumentVersion
} from '../services/document.service';
import { createHttpError } from '../../../utils/httpError';
import fs from 'fs/promises';

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export const documentController = {
  create: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      const document = await createDocument(ctx, {
        title: req.body.title,
        docType: req.body.docType,
        status: req.body.status,
        officeId: req.body.officeId,
      });
      res.status(201).json(document);
    } catch (error) {
      next(error);
    }
  },
  list: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      const filters: Record<string, unknown> = {};
      if (req.query.officeId) filters.office_id = req.query.officeId;
      if (req.query.docType) filters.doc_type = req.query.docType;
      if (req.query.status) filters.status = req.query.status;
      const page = clampInt(req.query.page, 1, 1, 100000);
      const limit = clampInt(req.query.limit, 500, 1, 2000);
      const documents = await listDocuments(ctx, filters, { page, limit });
      res.json(documents);
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      const document = await getDocumentById(ctx, String(req.params.id));
      res.json(document);
    } catch (error) {
      next(error);
    }
  },
  upload: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      if (!req.file) throw createHttpError(400, 'File is required');
      const version = await uploadDocumentVersion(ctx, String(req.params.id), req.file);
      res.status(201).json(version);
    } catch (error) {
      next(error);
    }
  },
  downloadVersion: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      const { version, absolutePath } = await getDocumentVersionDownload(ctx, String(req.params.versionId));
      await fs.access(absolutePath);
      res.setHeader('Content-Type', String(version.mime_type || 'application/octet-stream'));
      res.setHeader('Cache-Control', 'private, no-store');
      res.sendFile(absolutePath);
    } catch (error) {
      next(error);
    }
  },
};
