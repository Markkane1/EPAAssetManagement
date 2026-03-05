import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { createHttpError } from '../utils/httpError';
import { getRequestContext } from '../utils/scope';
import {
  decideApprovalMatrixRequest,
  listPendingApprovalMatrixRequests,
} from '../services/approvalMatrix.service';

function normalizeDecision(value: unknown): 'Approved' | 'Rejected' {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'APPROVED') return 'Approved';
  if (normalized === 'REJECTED') return 'Rejected';
  throw createHttpError(400, 'decision must be APPROVED or REJECTED');
}

export const approvalMatrixController = {
  pending: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      const rows = await listPendingApprovalMatrixRequests(ctx);
      res.json(rows);
    } catch (error) {
      next(error);
    }
  },
  decide: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      const result = await decideApprovalMatrixRequest(ctx, String(req.params.id || ''), {
        decision: normalizeDecision(req.body?.decision),
        notes: req.body?.notes ? String(req.body.notes) : undefined,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
};
