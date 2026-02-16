import { Router } from 'express';
import { assignmentController } from '../controllers/assignment.controller';
import { requireAuth } from '../middleware/auth';
import { validateParams, validateQuery } from '../middleware/validate';
import { upload } from '../modules/records/utils/upload';
import {
  assignmentListQuerySchema,
  assetItemIdParamSchema,
  employeeIdParamSchema,
  idParamSchema,
} from '../validators/workflowRouteSchemas';

const router = Router();

router.get('/', requireAuth, validateQuery(assignmentListQuerySchema), assignmentController.list);
router.get('/employee/:employeeId', requireAuth, validateParams(employeeIdParamSchema), validateQuery(assignmentListQuerySchema), assignmentController.getByEmployee);
router.get('/asset-item/:assetItemId', requireAuth, validateParams(assetItemIdParamSchema), validateQuery(assignmentListQuerySchema), assignmentController.getByAssetItem);
router.get('/:id/handover-slip.pdf', requireAuth, validateParams(idParamSchema), assignmentController.handoverSlipPdf);
router.post(
  '/:id/handover-slip/upload-signed',
  requireAuth,
  validateParams(idParamSchema),
  upload.fields([
    { name: 'signedHandoverFile', maxCount: 1 },
  ]),
  assignmentController.uploadSignedHandoverSlip
);
router.post('/:id/request-return', requireAuth, validateParams(idParamSchema), assignmentController.requestReturn);
router.get('/:id/return-slip.pdf', requireAuth, validateParams(idParamSchema), assignmentController.returnSlipPdf);
router.post(
  '/:id/return-slip/upload-signed',
  requireAuth,
  validateParams(idParamSchema),
  upload.fields([
    { name: 'signedReturnFile', maxCount: 1 },
  ]),
  assignmentController.uploadSignedReturnSlip
);
router.get('/:id', requireAuth, validateParams(idParamSchema), assignmentController.getById);
router.post('/', requireAuth, assignmentController.create);
router.put('/:id', requireAuth, validateParams(idParamSchema), assignmentController.update);
router.put('/:id/reassign', requireAuth, validateParams(idParamSchema), assignmentController.reassign);
router.delete('/:id', requireAuth, validateParams(idParamSchema), assignmentController.remove);

export default router;
