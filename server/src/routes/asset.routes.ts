import { Router } from 'express';
import { assetController } from '../controllers/asset.controller';
import { requireAuth } from '../middleware/auth';
import { createScopedRateLimiter } from '../middleware/rateLimitProfiles';
import { upload } from '../modules/records/utils/upload';

const router = Router();
const assetMutationLimiter = createScopedRateLimiter('assets-mutation', {
  windowMs: 5 * 60 * 1000,
  max: 70,
  message: 'Too many asset changes. Please try again later.',
});
const assetUploadLimiter = createScopedRateLimiter('assets-upload', {
  windowMs: 15 * 60 * 1000,
  max: 16,
  message: 'Too many asset uploads. Please try again later.',
});

router.get('/', requireAuth, assetController.list);
router.get('/category/:categoryId', requireAuth, assetController.getByCategory);
router.get('/vendor/:vendorId', requireAuth, assetController.getByVendor);
router.get('/:id', requireAuth, assetController.getById);
router.post('/', requireAuth, assetMutationLimiter, assetUploadLimiter, upload.single('assetAttachment'), assetController.create);
router.put('/:id', requireAuth, assetMutationLimiter, assetUploadLimiter, upload.single('assetAttachment'), assetController.update);
router.delete('/:id', requireAuth, assetMutationLimiter, assetController.remove);

export default router;
