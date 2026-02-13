import { Router } from 'express';
import { schemeController } from '../controllers/scheme.controller';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/authorize';

const router = Router();

router.get('/', requireAuth, schemeController.list);
router.get('/project/:projectId', requireAuth, schemeController.getByProject);
router.get('/:id', requireAuth, schemeController.getById);
router.post('/', requireAuth, requireAdmin, schemeController.create);
router.put('/:id', requireAuth, requireAdmin, schemeController.update);
router.delete('/:id', requireAuth, requireAdmin, schemeController.remove);

export default router;
