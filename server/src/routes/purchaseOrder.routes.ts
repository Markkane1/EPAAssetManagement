import { Router } from 'express';
import { purchaseOrderController } from '../controllers/purchaseOrder.controller';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/authorize';
import { upload } from '../modules/records/utils/upload';

const router = Router();

router.get('/', requireAuth, purchaseOrderController.list);
router.get('/vendor/:vendorId', requireAuth, purchaseOrderController.getByVendor);
router.get('/project/:projectId', requireAuth, purchaseOrderController.getByProject);
router.get('/pending', requireAuth, purchaseOrderController.getPending);
router.get('/:id', requireAuth, purchaseOrderController.getById);
router.post('/', requireAuth, requireAdmin, upload.single('purchaseOrderAttachment'), purchaseOrderController.create);
router.put('/:id', requireAuth, requireAdmin, upload.single('purchaseOrderAttachment'), purchaseOrderController.update);
router.delete('/:id', requireAuth, requireAdmin, purchaseOrderController.remove);

export default router;
