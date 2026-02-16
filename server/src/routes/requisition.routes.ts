import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validateParams, validateQuery } from '../middleware/validate';
import { upload } from '../modules/records/utils/upload';
import { requisitionController } from '../controllers/requisition.controller';
import { idParamSchema, requisitionLineParamSchema, requisitionListQuerySchema } from '../validators/workflowRouteSchemas';

const router = Router();

router.get('/', requireAuth, validateQuery(requisitionListQuerySchema), requisitionController.list);
router.post('/', requireAuth, upload.single('requisitionFile'), requisitionController.create);
router.get('/:id/issuance-report.pdf', requireAuth, validateParams(idParamSchema), requisitionController.issuanceReport);
router.get('/:id', requireAuth, validateParams(idParamSchema), requisitionController.getById);
router.post(
  '/:id/upload-signed-issuance',
  requireAuth,
  validateParams(idParamSchema),
  upload.fields([
    { name: 'signedIssuanceFile', maxCount: 1 },
    { name: 'file', maxCount: 1 },
  ]),
  requisitionController.uploadSignedIssuance
);
router.post('/:id/adjust', requireAuth, validateParams(idParamSchema), requisitionController.adjust);
router.post('/:id/fulfill', requireAuth, validateParams(idParamSchema), requisitionController.fulfill);
router.post('/:id/lines/:lineId/map', requireAuth, validateParams(requisitionLineParamSchema), requisitionController.mapLine);
router.post('/:id/verify', requireAuth, validateParams(idParamSchema), requisitionController.verify);

export default router;
