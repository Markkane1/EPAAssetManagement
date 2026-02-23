import { Router } from 'express';
import { vendorController } from '../controllers/vendor.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth, vendorController.list);
router.get('/:id', requireAuth, vendorController.getById);
router.post('/', requireAuth, vendorController.create);
router.put('/:id', requireAuth, vendorController.update);
router.delete('/:id', requireAuth, vendorController.remove);

export default router;
