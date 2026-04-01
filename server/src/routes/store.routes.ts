import { Router } from 'express';
import { storeController } from '../controllers/store.controller';
import { requireAuth } from '../middleware/auth';
import { requireOrgAdminOrCentralStoreCaretaker } from '../middleware/authorize';

const router = Router();

router.get('/', requireAuth, requireOrgAdminOrCentralStoreCaretaker, storeController.list);

export default router;
