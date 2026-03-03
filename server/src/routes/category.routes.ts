import { Router } from 'express';
import { categoryController } from '../controllers/category.controller';
import { requireAuth } from '../middleware/auth';
import { requireAdmin, requireOrgAdminOrCentralStoreCaretaker } from '../middleware/authorize';

const router = Router();

router.get('/', requireAuth, categoryController.list);
router.get('/:id', requireAuth, categoryController.getById);
router.post('/', requireAuth, requireOrgAdminOrCentralStoreCaretaker, categoryController.create);
router.put('/:id', requireAuth, requireOrgAdminOrCentralStoreCaretaker, categoryController.update);
router.delete('/:id', requireAuth, requireAdmin, categoryController.remove);

export default router;
