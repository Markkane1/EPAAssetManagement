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

router.get('/inventory-snapshot', requireAuth, reportReadLimiter, reportController.inventorySnapshot);
router.get('/moveable-assigned', requireAuth, reportReadLimiter, reportController.moveableAssigned);
router.get('/consumable-assigned', requireAuth, reportReadLimiter, reportController.consumableAssigned);
router.get('/consumable-consumption', requireAuth, reportReadLimiter, reportController.consumableConsumed);
router.get('/moveable-lifecycle/:assetItemId', requireAuth, reportReadLimiter, reportController.moveableLifecycle);
router.get('/lot-lifecycle/:lotId', requireAuth, reportReadLimiter, reportController.lotLifecycle);
router.get('/assignment-trace/:assignmentId', requireAuth, reportReadLimiter, reportController.assignmentTrace);
router.get('/requisition-aging', requireAuth, reportReadLimiter, reportController.requisitionAging);
router.get('/return-aging', requireAuth, reportReadLimiter, reportController.returnAging);
router.get('/analytics-trends', requireAuth, reportReadLimiter, reportController.analyticsTrends);
router.get('/requisitions', requireAuth, reportReadLimiter, reportController.requisitions);
router.get('/noncompliance', requireAuth, reportReadLimiter, reportController.noncompliance);

export default router;
