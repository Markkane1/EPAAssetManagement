import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller';

const router = Router();

router.get('/', dashboardController.getDashboardData);
router.get('/stats', dashboardController.getStats);
router.get('/activity', dashboardController.getRecentActivity);
router.get('/assets-by-category', dashboardController.getAssetsByCategory);
router.get('/assets-by-status', dashboardController.getAssetsByStatus);

export default router;
