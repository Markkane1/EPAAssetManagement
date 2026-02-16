import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validateParams, validateQuery } from '../middleware/validate';
import { returnRequestController } from '../controllers/returnRequest.controller';
import { upload } from '../modules/records/utils/upload';
import { idParamSchema, returnRequestListQuerySchema } from '../validators/workflowRouteSchemas';

const router = Router();

router.get('/', requireAuth, validateQuery(returnRequestListQuerySchema), returnRequestController.list);
router.get('/:id/return-receipt.pdf', requireAuth, validateParams(idParamSchema), returnRequestController.receiptPdf);
router.get('/:id', requireAuth, validateParams(idParamSchema), returnRequestController.getById);
router.post('/', requireAuth, returnRequestController.create);
router.post('/:id/receive', requireAuth, validateParams(idParamSchema), returnRequestController.receive);
router.post(
  '/:id/upload-signed-return',
  requireAuth,
  validateParams(idParamSchema),
  upload.fields([
    { name: 'signedReturnFile', maxCount: 1 },
    { name: 'file', maxCount: 1 },
  ]),
  returnRequestController.uploadSignedReturn
);

export default router;
