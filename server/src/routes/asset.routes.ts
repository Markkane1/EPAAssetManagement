import { Router } from 'express';
import { assetController } from '../controllers/asset.controller';

const router = Router();

router.get('/', assetController.list);
router.get('/category/:categoryId', assetController.getByCategory);
router.get('/vendor/:vendorId', assetController.getByVendor);
router.get('/:id', assetController.getById);
router.post('/', assetController.create);
router.put('/:id', assetController.update);
router.delete('/:id', assetController.remove);

export default router;
