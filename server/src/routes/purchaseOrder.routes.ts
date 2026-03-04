import { Router } from 'express';
import { purchaseOrderController } from '../controllers/purchaseOrder.controller';
import { requireAuth } from '../middleware/auth';
import { requireRoles } from '../middleware/authorize';
import { upload } from '../modules/records/utils/upload';

const router = Router();

router.get('/', requireAuth, purchaseOrderController.list);
router.get('/vendor/:vendorId', requireAuth, purchaseOrderController.getByVendor);
router.get('/project/:projectId', requireAuth, purchaseOrderController.getByProject);
router.get('/pending', requireAuth, purchaseOrderController.getPending);
router.get('/:id', requireAuth, purchaseOrderController.getById);
router.post(
  '/',
  requireAuth,
  requireRoles(['org_admin', 'office_head', 'procurement_officer']),
  upload.single('purchaseOrderAttachment'),
  purchaseOrderController.create
);
router.put(
  '/:id',
  requireAuth,
  requireRoles(['org_admin', 'office_head', 'procurement_officer']),
  upload.single('purchaseOrderAttachment'),
  purchaseOrderController.update
);
router.delete('/:id', requireAuth, requireRoles(['org_admin', 'office_head', 'procurement_officer']), purchaseOrderController.remove);

export default router;
