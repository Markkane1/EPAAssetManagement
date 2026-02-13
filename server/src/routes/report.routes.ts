import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { reportController } from '../controllers/report.controller';

const router = Router();

router.get('/requisitions', requireAuth, reportController.requisitions);
router.get('/noncompliance', requireAuth, reportController.noncompliance);

export default router;
