import { Response, NextFunction } from 'express';
import type { AuthRequest } from '../../../middleware/auth';
import { getRequestContext } from '../../../utils/scope';
import { createDocument, getDocumentById, listDocuments, uploadDocumentVersion } from '../services/document.service';
import { createHttpError } from '../../../utils/httpError';

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
      const documents = await listDocuments(ctx, filters);
      res.json(documents);
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      const document = await getDocumentById(ctx, req.params.id);
      res.json(document);
    } catch (error) {
      next(error);
    }
  },
  upload: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      if (!req.file) throw createHttpError(400, 'File is required');
      const version = await uploadDocumentVersion(ctx, req.params.id, req.file);
      res.status(201).json(version);
    } catch (error) {
      next(error);
    }
  },
};
