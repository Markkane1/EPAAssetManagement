import { Router } from 'express';
import { settingsController } from '../controllers/settings.controller';

const router = Router();

router.get('/', settingsController.getSettings);
router.put('/', settingsController.updateSettings);
router.post('/backup', settingsController.backupData);
router.post('/test-email', settingsController.testEmail);

export default router;
