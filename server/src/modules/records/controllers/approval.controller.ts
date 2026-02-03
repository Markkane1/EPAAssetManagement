import { Response, NextFunction } from 'express';
import type { AuthRequest } from '../../../middleware/auth';
import { getRequestContext } from '../../../utils/scope';
import { requestApproval, decideApproval } from '../services/approval.service';

export const approvalController = {
  request: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      const approval = await requestApproval(ctx, req.params.id, {
        approverUserId: req.body.approverUserId,
        approverRole: req.body.approverRole,
        notes: req.body.notes,
      });
      res.status(201).json(approval);
    } catch (error) {
      next(error);
    }
  },
  decide: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      const approval = await decideApproval(ctx, req.params.id, {
        decision: req.body.decision,
        decisionNotes: req.body.decisionNotes,
      });
      res.json(approval);
    } catch (error) {
      next(error);
    }
  },
};
