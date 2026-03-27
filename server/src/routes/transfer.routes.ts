import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { createScopedRateLimiter } from '../middleware/rateLimitProfiles';
import { validateParams, validateQuery } from '../middleware/validate';
import { transferController } from '../controllers/transfer.controller';
import {
  assetItemIdParamSchema,
  idParamSchema,
  officeIdParamSchema,
  transferListQuerySchema,
} from '../validators/workflowRouteSchemas';

const router = Router();
const transferMutationLimiter = createScopedRateLimiter('transfers-mutation', {
  windowMs: 5 * 60 * 1000,
  max: 90,
  message: 'Too many transfer changes. Please try again later.',
});

router.get('/', requireAuth, validateQuery(transferListQuerySchema), transferController.list);
router.get('/asset-item/:assetItemId', requireAuth, validateParams(assetItemIdParamSchema), validateQuery(transferListQuerySchema), transferController.getByAssetItem);
router.get('/office/:officeId', requireAuth, validateParams(officeIdParamSchema), validateQuery(transferListQuerySchema), transferController.getByOffice);
router.get('/:id', requireAuth, validateParams(idParamSchema), transferController.getById);
router.post('/', requireAuth, transferMutationLimiter, transferController.create);
router.post('/:id/approve', requireAuth, transferMutationLimiter, validateParams(idParamSchema), transferController.approve);
router.post('/:id/dispatch-to-store', requireAuth, transferMutationLimiter, validateParams(idParamSchema), transferController.dispatchToStore);
router.post('/:id/receive-at-store', requireAuth, transferMutationLimiter, validateParams(idParamSchema), transferController.receiveAtStore);
router.post('/:id/dispatch-to-dest', requireAuth, transferMutationLimiter, validateParams(idParamSchema), transferController.dispatchToDest);
router.post('/:id/receive-at-dest', requireAuth, transferMutationLimiter, validateParams(idParamSchema), transferController.receiveAtDest);
router.post('/:id/reject', requireAuth, transferMutationLimiter, validateParams(idParamSchema), transferController.reject);
router.post('/:id/cancel', requireAuth, transferMutationLimiter, validateParams(idParamSchema), transferController.cancel);
router.delete('/:id', requireAuth, transferMutationLimiter, validateParams(idParamSchema), transferController.remove);

export default router;
