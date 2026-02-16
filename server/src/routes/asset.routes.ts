import { Router } from 'express';
import { assetController } from '../controllers/asset.controller';
import { requireAuth } from '../middleware/auth';
import { upload } from '../modules/records/utils/upload';

const router = Router();

router.get('/', requireAuth, assetController.list);
router.get('/category/:categoryId', requireAuth, assetController.getByCategory);
router.get('/vendor/:vendorId', requireAuth, assetController.getByVendor);
router.get('/:id', requireAuth, assetController.getById);
router.post('/', requireAuth, upload.single('assetAttachment'), assetController.create);
router.put('/:id', requireAuth, upload.single('assetAttachment'), assetController.update);
router.delete('/:id', requireAuth, assetController.remove);

export default router;
