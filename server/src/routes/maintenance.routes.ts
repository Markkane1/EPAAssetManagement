import { Router } from 'express';
import { maintenanceController } from '../controllers/maintenance.controller';
import { requireAuth } from '../middleware/auth';
import { createScopedRateLimiter } from '../middleware/rateLimitProfiles';

const router = Router();
const maintenanceMutationLimiter = createScopedRateLimiter('maintenance-mutation', {
  windowMs: 5 * 60 * 1000,
  max: 80,
  message: 'Too many maintenance changes. Please try again later.',
});

router.get('/', requireAuth, maintenanceController.list);
router.get('/asset-item/:assetItemId', requireAuth, maintenanceController.getByAssetItem);
router.get('/scheduled', requireAuth, maintenanceController.getScheduled);
router.get('/:id', requireAuth, maintenanceController.getById);
router.post('/', requireAuth, maintenanceMutationLimiter, maintenanceController.create);
router.put('/:id', requireAuth, maintenanceMutationLimiter, maintenanceController.update);
router.put('/:id/complete', requireAuth, maintenanceMutationLimiter, maintenanceController.complete);
router.delete('/:id', requireAuth, maintenanceMutationLimiter, maintenanceController.remove);

export default router;
