import { Router } from 'express';
import { storeController } from '../controllers/store.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth, storeController.list);

export default router;
