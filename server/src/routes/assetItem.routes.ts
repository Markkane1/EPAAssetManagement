import { Router } from 'express';
import { assetItemController } from '../controllers/assetItem.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth, assetItemController.list);
router.get('/asset/:assetId', requireAuth, assetItemController.getByAsset);
router.get('/location/:locationId', requireAuth, assetItemController.getByLocation);
router.get('/available', requireAuth, assetItemController.getAvailable);
router.get('/:id', requireAuth, assetItemController.getById);
router.post('/', requireAuth, assetItemController.create);
router.post('/batch', requireAuth, assetItemController.createBatch);
router.put('/:id', requireAuth, assetItemController.update);
router.delete('/:id', requireAuth, assetItemController.remove);

export default router;
