import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { createScopedRateLimiter } from '../middleware/rateLimitProfiles';
import { validateParams, validateQuery } from '../middleware/validate';
import { returnRequestController } from '../controllers/returnRequest.controller';
import { upload } from '../modules/records/utils/upload';
import { idParamSchema, returnRequestListQuerySchema } from '../validators/workflowRouteSchemas';

const router = Router();
const returnRequestMutationLimiter = createScopedRateLimiter('return-requests-mutation', {
  windowMs: 5 * 60 * 1000,
  max: 80,
  message: 'Too many return request changes. Please try again later.',
});
const returnRequestUploadLimiter = createScopedRateLimiter('return-requests-upload', {
  windowMs: 15 * 60 * 1000,
  max: 16,
  message: 'Too many return-document uploads. Please try again later.',
});

router.get('/', requireAuth, validateQuery(returnRequestListQuerySchema), returnRequestController.list);
router.get('/:id/return-receipt.pdf', requireAuth, validateParams(idParamSchema), returnRequestController.receiptPdf);
router.get('/:id', requireAuth, validateParams(idParamSchema), returnRequestController.getById);
router.post('/', requireAuth, returnRequestMutationLimiter, returnRequestController.create);
router.post('/:id/receive', requireAuth, returnRequestMutationLimiter, validateParams(idParamSchema), returnRequestController.receive);
router.post(
  '/:id/upload-signed-return',
  requireAuth,
  returnRequestUploadLimiter,
  validateParams(idParamSchema),
  upload.fields([
    { name: 'signedReturnFile', maxCount: 1 },
    { name: 'file', maxCount: 1 },
  ]),
  returnRequestController.uploadSignedReturn
);

export default router;
