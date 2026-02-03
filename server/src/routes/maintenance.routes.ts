import { Router } from 'express';
import { maintenanceController } from '../controllers/maintenance.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth, maintenanceController.list);
router.get('/asset-item/:assetItemId', requireAuth, maintenanceController.getByAssetItem);
router.get('/scheduled', requireAuth, maintenanceController.getScheduled);
router.get('/:id', requireAuth, maintenanceController.getById);
router.post('/', requireAuth, maintenanceController.create);
router.put('/:id', requireAuth, maintenanceController.update);
router.put('/:id/complete', requireAuth, maintenanceController.complete);
router.delete('/:id', requireAuth, maintenanceController.remove);

export default router;
