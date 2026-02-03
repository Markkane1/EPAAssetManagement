import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { transferController } from '../controllers/transfer.controller';

const router = Router();

router.get('/', requireAuth, transferController.list);
router.get('/asset-item/:assetItemId', requireAuth, transferController.getByAssetItem);
router.get('/office/:officeId', requireAuth, transferController.getByOffice);
router.get('/:id', requireAuth, transferController.getById);
router.post('/', requireAuth, transferController.create);
router.put('/:id/status', requireAuth, transferController.updateStatus);
router.delete('/:id', requireAuth, transferController.remove);

export default router;
