import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/authorize';

const router = Router();

router.get('/', requireAuth, requireAdmin, dashboardController.getDashboardData);
router.get('/stats', requireAuth, requireAdmin, dashboardController.getStats);
router.get('/activity', requireAuth, requireAdmin, dashboardController.getRecentActivity);
router.get('/assets-by-category', requireAuth, requireAdmin, dashboardController.getAssetsByCategory);
router.get('/assets-by-status', requireAuth, requireAdmin, dashboardController.getAssetsByStatus);

export default router;
