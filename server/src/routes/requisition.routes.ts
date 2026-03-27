import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { createScopedRateLimiter } from '../middleware/rateLimitProfiles';
import { validateParams, validateQuery } from '../middleware/validate';
import { upload } from '../modules/records/utils/upload';
import { requisitionController } from '../controllers/requisition.controller';
import { idParamSchema, requisitionLineParamSchema, requisitionListQuerySchema } from '../validators/workflowRouteSchemas';

const router = Router();
const requisitionMutationLimiter = createScopedRateLimiter('requisitions-mutation', {
  windowMs: 5 * 60 * 1000,
  max: 80,
  message: 'Too many requisition changes. Please try again later.',
});
const requisitionUploadLimiter = createScopedRateLimiter('requisitions-upload', {
  windowMs: 15 * 60 * 1000,
  max: 16,
  message: 'Too many requisition uploads. Please try again later.',
});

router.get('/', requireAuth, validateQuery(requisitionListQuerySchema), requisitionController.list);
router.post('/', requireAuth, requisitionUploadLimiter, upload.single('requisitionFile'), requisitionController.create);
router.get('/:id/issuance-report.pdf', requireAuth, validateParams(idParamSchema), requisitionController.issuanceReport);
router.get('/:id', requireAuth, validateParams(idParamSchema), requisitionController.getById);
router.post(
  '/:id/upload-signed-issuance',
  requireAuth,
  requisitionUploadLimiter,
  validateParams(idParamSchema),
  upload.fields([
    { name: 'signedIssuanceFile', maxCount: 1 },
    { name: 'file', maxCount: 1 },
  ]),
  requisitionController.uploadSignedIssuance
);
router.post('/:id/adjust', requireAuth, requisitionMutationLimiter, validateParams(idParamSchema), requisitionController.adjust);
router.post('/:id/fulfill', requireAuth, requisitionMutationLimiter, validateParams(idParamSchema), requisitionController.fulfill);
router.post('/:id/lines/:lineId/map', requireAuth, requisitionMutationLimiter, validateParams(requisitionLineParamSchema), requisitionController.mapLine);
router.post('/:id/verify', requireAuth, requisitionMutationLimiter, validateParams(idParamSchema), requisitionController.verify);

export default router;
