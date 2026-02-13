import { Router } from 'express';
import { projectController } from '../controllers/project.controller';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/authorize';

const router = Router();

router.get('/', requireAuth, projectController.list);
router.get('/active', requireAuth, projectController.getActive);
router.get('/:id', requireAuth, projectController.getById);
router.post('/', requireAuth, requireAdmin, projectController.create);
router.put('/:id', requireAuth, requireAdmin, projectController.update);
router.delete('/:id', requireAuth, requireAdmin, projectController.remove);

export default router;
