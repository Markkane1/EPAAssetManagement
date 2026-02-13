import { Router } from 'express';
import { vendorController } from '../controllers/vendor.controller';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/authorize';

const router = Router();

router.get('/', requireAuth, vendorController.list);
router.get('/:id', requireAuth, vendorController.getById);
router.post('/', requireAuth, requireAdmin, vendorController.create);
router.put('/:id', requireAuth, requireAdmin, vendorController.update);
router.delete('/:id', requireAuth, requireAdmin, vendorController.remove);

export default router;
