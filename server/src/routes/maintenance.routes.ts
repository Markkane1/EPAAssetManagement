import { Router } from 'express';
import { maintenanceController } from '../controllers/maintenance.controller';

const router = Router();

router.get('/', maintenanceController.list);
router.get('/asset-item/:assetItemId', maintenanceController.getByAssetItem);
router.get('/scheduled', maintenanceController.getScheduled);
router.get('/:id', maintenanceController.getById);
router.post('/', maintenanceController.create);
router.put('/:id', maintenanceController.update);
router.put('/:id/complete', maintenanceController.complete);
router.delete('/:id', maintenanceController.remove);

export default router;
