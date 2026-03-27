import { Router } from 'express';
import { purchaseOrderController } from '../controllers/purchaseOrder.controller';
import { requireAuth } from '../middleware/auth';
import { requireRoles } from '../middleware/authorize';
import { createScopedRateLimiter } from '../middleware/rateLimitProfiles';
import { upload } from '../modules/records/utils/upload';

const router = Router();
const purchaseOrderMutationLimiter = createScopedRateLimiter('purchase-orders-mutation', {
  windowMs: 5 * 60 * 1000,
  max: 70,
  message: 'Too many purchase order changes. Please try again later.',
});
const purchaseOrderUploadLimiter = createScopedRateLimiter('purchase-orders-upload', {
  windowMs: 15 * 60 * 1000,
  max: 16,
  message: 'Too many purchase order uploads. Please try again later.',
});

router.get('/', requireAuth, purchaseOrderController.list);
router.get('/vendor/:vendorId', requireAuth, purchaseOrderController.getByVendor);
router.get('/project/:projectId', requireAuth, purchaseOrderController.getByProject);
router.get('/pending', requireAuth, purchaseOrderController.getPending);
router.get('/:id', requireAuth, purchaseOrderController.getById);
router.post(
  '/',
  requireAuth,
  purchaseOrderMutationLimiter,
  purchaseOrderUploadLimiter,
  requireRoles(['org_admin', 'office_head', 'procurement_officer']),
  upload.single('purchaseOrderAttachment'),
  purchaseOrderController.create
);
router.put(
  '/:id',
  requireAuth,
  purchaseOrderMutationLimiter,
  purchaseOrderUploadLimiter,
  requireRoles(['org_admin', 'office_head', 'procurement_officer']),
  upload.single('purchaseOrderAttachment'),
  purchaseOrderController.update
);
router.delete('/:id', requireAuth, purchaseOrderMutationLimiter, requireRoles(['org_admin', 'office_head', 'procurement_officer']), purchaseOrderController.remove);

export default router;
