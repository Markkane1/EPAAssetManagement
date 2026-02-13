import { Router } from 'express';
import { consumableController } from '../controllers/consumable.controller';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/authorize';

const router = Router();

router.get('/', requireAuth, consumableController.list);
router.get('/:id', requireAuth, consumableController.getById);
router.post('/', requireAuth, requireAdmin, consumableController.create);
router.put('/:id', requireAuth, requireAdmin, consumableController.update);
router.delete('/:id', requireAuth, requireAdmin, consumableController.remove);

export default router;
