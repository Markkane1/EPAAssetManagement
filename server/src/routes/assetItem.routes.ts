import { Router } from 'express';
import { assetItemController } from '../controllers/assetItem.controller';

const router = Router();

router.get('/', assetItemController.list);
router.get('/asset/:assetId', assetItemController.getByAsset);
router.get('/location/:locationId', assetItemController.getByLocation);
router.get('/available', assetItemController.getAvailable);
router.get('/:id', assetItemController.getById);
router.post('/', assetItemController.create);
router.post('/batch', assetItemController.createBatch);
router.put('/:id', assetItemController.update);
router.delete('/:id', assetItemController.remove);

export default router;
