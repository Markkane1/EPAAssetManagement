import { Router } from 'express';
import { assignmentController } from '../controllers/assignment.controller';
import { requireAuth } from '../middleware/auth';
import { createScopedRateLimiter } from '../middleware/rateLimitProfiles';
import { validateParams, validateQuery } from '../middleware/validate';
import { upload } from '../modules/records/utils/upload';
import {
  assignmentListQuerySchema,
  assetItemIdParamSchema,
  employeeIdParamSchema,
  idParamSchema,
} from '../validators/workflowRouteSchemas';

const router = Router();
const assignmentMutationLimiter = createScopedRateLimiter('assignments-mutation', {
  windowMs: 5 * 60 * 1000,
  max: 90,
  message: 'Too many assignment changes. Please try again later.',
});
const assignmentUploadLimiter = createScopedRateLimiter('assignments-upload', {
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many signed slip uploads. Please try again later.',
});

router.get('/', requireAuth, validateQuery(assignmentListQuerySchema), assignmentController.list);
router.get('/employee/:employeeId', requireAuth, validateParams(employeeIdParamSchema), validateQuery(assignmentListQuerySchema), assignmentController.getByEmployee);
router.get('/asset-item/:assetItemId', requireAuth, validateParams(assetItemIdParamSchema), validateQuery(assignmentListQuerySchema), assignmentController.getByAssetItem);
router.get('/:id/handover-slip.pdf', requireAuth, validateParams(idParamSchema), assignmentController.handoverSlipPdf);
router.post(
  '/:id/handover-slip/upload-signed',
  requireAuth,
  assignmentUploadLimiter,
  validateParams(idParamSchema),
  upload.fields([
    { name: 'signedHandoverFile', maxCount: 1 },
  ]),
  assignmentController.uploadSignedHandoverSlip
);
router.post('/:id/request-return', requireAuth, assignmentMutationLimiter, validateParams(idParamSchema), assignmentController.requestReturn);
router.get('/:id/return-slip.pdf', requireAuth, validateParams(idParamSchema), assignmentController.returnSlipPdf);
router.post(
  '/:id/return-slip/upload-signed',
  requireAuth,
  assignmentUploadLimiter,
  validateParams(idParamSchema),
  upload.fields([
    { name: 'signedReturnFile', maxCount: 1 },
  ]),
  assignmentController.uploadSignedReturnSlip
);
router.get('/:id', requireAuth, validateParams(idParamSchema), assignmentController.getById);
router.post('/', requireAuth, assignmentMutationLimiter, assignmentController.create);
router.put('/:id', requireAuth, assignmentMutationLimiter, validateParams(idParamSchema), assignmentController.update);
router.put('/:id/reassign', requireAuth, assignmentMutationLimiter, validateParams(idParamSchema), assignmentController.reassign);
router.delete('/:id', requireAuth, assignmentMutationLimiter, validateParams(idParamSchema), assignmentController.remove);

export default router;
