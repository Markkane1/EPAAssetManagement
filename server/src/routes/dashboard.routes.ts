import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth, dashboardController.getDashboardData);
router.get('/stats', requireAuth, dashboardController.getStats);
router.get('/activity', requireAuth, dashboardController.getRecentActivity);
router.get('/assets-by-category', requireAuth, dashboardController.getAssetsByCategory);
router.get('/assets-by-status', requireAuth, dashboardController.getAssetsByStatus);

export default router;
