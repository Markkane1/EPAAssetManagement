import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validateParams, validateQuery } from '../middleware/validate';
import { transferController } from '../controllers/transfer.controller';
import {
  assetItemIdParamSchema,
  idParamSchema,
  officeIdParamSchema,
  transferListQuerySchema,
} from '../validators/workflowRouteSchemas';

const router = Router();

router.get('/', requireAuth, validateQuery(transferListQuerySchema), transferController.list);
router.get('/asset-item/:assetItemId', requireAuth, validateParams(assetItemIdParamSchema), validateQuery(transferListQuerySchema), transferController.getByAssetItem);
router.get('/office/:officeId', requireAuth, validateParams(officeIdParamSchema), validateQuery(transferListQuerySchema), transferController.getByOffice);
router.get('/:id', requireAuth, validateParams(idParamSchema), transferController.getById);
router.post('/', requireAuth, transferController.create);
router.post('/:id/approve', requireAuth, validateParams(idParamSchema), transferController.approve);
router.post('/:id/dispatch-to-store', requireAuth, validateParams(idParamSchema), transferController.dispatchToStore);
router.post('/:id/receive-at-store', requireAuth, validateParams(idParamSchema), transferController.receiveAtStore);
router.post('/:id/dispatch-to-dest', requireAuth, validateParams(idParamSchema), transferController.dispatchToDest);
router.post('/:id/receive-at-dest', requireAuth, validateParams(idParamSchema), transferController.receiveAtDest);
router.post('/:id/reject', requireAuth, validateParams(idParamSchema), transferController.reject);
router.post('/:id/cancel', requireAuth, validateParams(idParamSchema), transferController.cancel);
router.delete('/:id', requireAuth, validateParams(idParamSchema), transferController.remove);

export default router;
