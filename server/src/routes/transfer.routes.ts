import { Router } from 'express';
import { transferController } from '../controllers/transfer.controller';

const router = Router();

router.get('/', transferController.list);
router.get('/recent', transferController.getRecent);
router.get('/asset-item/:assetItemId', transferController.getByAssetItem);
router.get('/location/:locationId', transferController.getByLocation);
router.get('/:id', transferController.getById);
router.post('/', transferController.create);
router.delete('/:id', transferController.remove);

export default router;
