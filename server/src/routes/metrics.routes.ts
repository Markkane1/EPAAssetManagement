import { Router } from 'express';
import type { NextFunction, Response } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import { createHttpError } from '../utils/httpError';
import { getMetricsSnapshot, renderPrometheusMetrics } from '../observability/metrics';

const router = Router();

router.get('/', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.isOrgAdmin) {
      throw createHttpError(403, 'Not permitted to view metrics');
    }

    const acceptHeader = String(req.headers.accept || '').toLowerCase();
    if (acceptHeader.includes('text/plain')) {
      res.setHeader('Content-Type', 'text/plain; version=0.0.4');
      return res.status(200).send(renderPrometheusMetrics());
    }

    return res.status(200).json(getMetricsSnapshot());
  } catch (error) {
    return next(error);
  }
});

export default router;

