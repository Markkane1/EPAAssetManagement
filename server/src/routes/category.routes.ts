import { Router } from 'express';
import { categoryController } from '../controllers/category.controller';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/authorize';

const router = Router();

router.get('/', requireAuth, categoryController.list);
router.get('/:id', requireAuth, categoryController.getById);
router.post('/', requireAuth, requireAdmin, categoryController.create);
router.put('/:id', requireAuth, requireAdmin, categoryController.update);
router.delete('/:id', requireAuth, requireAdmin, categoryController.remove);

export default router;
