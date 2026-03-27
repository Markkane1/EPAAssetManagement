import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { createScopedRateLimiter } from '../middleware/rateLimitProfiles';
import { reportController } from '../controllers/report.controller';

const router = Router();
const reportReadLimiter = createScopedRateLimiter('reports-read', {
  windowMs: 60 * 1000,
  max: 45,
  message: 'Too many report requests. Please try again later.',
});

router.get('/requisitions', requireAuth, reportReadLimiter, reportController.requisitions);
router.get('/noncompliance', requireAuth, reportReadLimiter, reportController.noncompliance);

export default router;
