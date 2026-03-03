import { Router } from 'express';
import { schemeController } from '../controllers/scheme.controller';
import { requireAuth } from '../middleware/auth';
import { requireOrgAdminOrCentralStoreCaretaker } from '../middleware/authorize';

const router = Router();

router.get('/', requireAuth, requireOrgAdminOrCentralStoreCaretaker, schemeController.list);
router.get('/project/:projectId', requireAuth, requireOrgAdminOrCentralStoreCaretaker, schemeController.getByProject);
router.get('/:id', requireAuth, requireOrgAdminOrCentralStoreCaretaker, schemeController.getById);
router.post('/', requireAuth, requireOrgAdminOrCentralStoreCaretaker, schemeController.create);
router.put('/:id', requireAuth, requireOrgAdminOrCentralStoreCaretaker, schemeController.update);
router.delete('/:id', requireAuth, requireOrgAdminOrCentralStoreCaretaker, schemeController.remove);

export default router;
