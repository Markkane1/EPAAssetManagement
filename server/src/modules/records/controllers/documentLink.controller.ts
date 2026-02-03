import { Response, NextFunction } from 'express';
import type { AuthRequest } from '../../../middleware/auth';
import { getRequestContext } from '../../../utils/scope';
import { createDocumentLink } from '../services/documentLink.service';

export const documentLinkController = {
  create: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      const link = await createDocumentLink(ctx, {
        documentId: req.body.documentId,
        entityType: req.body.entityType,
        entityId: req.body.entityId,
        requiredForStatus: req.body.requiredForStatus,
      });
      res.status(201).json(link);
    } catch (error) {
      next(error);
    }
  },
};
