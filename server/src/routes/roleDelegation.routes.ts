import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireCsrf } from '../middleware/csrf';
import { roleDelegationController } from '../controllers/roleDelegation.controller';

const router = Router();

router.use(requireAuth);
router.get('/', roleDelegationController.list);
router.post('/', requireCsrf, roleDelegationController.create);
router.post('/:id/revoke', requireCsrf, roleDelegationController.revoke);

export default router;
