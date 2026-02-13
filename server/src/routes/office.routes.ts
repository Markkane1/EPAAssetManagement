import { Router } from 'express';
import { officeController } from '../controllers/office.controller';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/authorize';

const router = Router();

router.get('/', requireAuth, officeController.list);
router.get('/:id', requireAuth, officeController.getById);
router.post('/', requireAuth, requireAdmin, officeController.create);
router.put('/:id', requireAuth, requireAdmin, officeController.update);
router.delete('/:id', requireAuth, requireAdmin, officeController.remove);

export default router;
