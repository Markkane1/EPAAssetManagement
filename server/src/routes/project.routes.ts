import { Router } from 'express';
import { projectController } from '../controllers/project.controller';
import { requireAuth } from '../middleware/auth';
import { requireOrgAdminOrCentralStoreCaretaker } from '../middleware/authorize';

const router = Router();

router.get('/', requireAuth, requireOrgAdminOrCentralStoreCaretaker, projectController.list);
router.get('/active', requireAuth, requireOrgAdminOrCentralStoreCaretaker, projectController.getActive);
router.get('/:id', requireAuth, requireOrgAdminOrCentralStoreCaretaker, projectController.getById);
router.post('/', requireAuth, requireOrgAdminOrCentralStoreCaretaker, projectController.create);
router.put('/:id', requireAuth, requireOrgAdminOrCentralStoreCaretaker, projectController.update);
router.delete('/:id', requireAuth, requireOrgAdminOrCentralStoreCaretaker, projectController.remove);

export default router;
