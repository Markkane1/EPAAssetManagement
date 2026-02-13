import { Router } from 'express';
import { settingsController } from '../controllers/settings.controller';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/authorize';

const router = Router();

router.get('/', requireAuth, requireAdmin, settingsController.getSettings);
router.put('/', requireAuth, requireAdmin, settingsController.updateSettings);
router.post('/backup', requireAuth, requireAdmin, settingsController.backupData);
router.post('/test-email', requireAuth, requireAdmin, settingsController.testEmail);

export default router;
