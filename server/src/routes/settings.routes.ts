import { Router } from 'express';
import { settingsController } from '../controllers/settings.controller';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/authorize';
import { createScopedRateLimiter } from '../middleware/rateLimitProfiles';

const router = Router();
const settingsMutationLimiter = createScopedRateLimiter('settings-mutation', {
  windowMs: 10 * 60 * 1000,
  max: 40,
  message: 'Too many settings changes. Please try again later.',
});

router.get('/', requireAuth, requireAdmin, settingsController.getSettings);
router.put('/', requireAuth, settingsMutationLimiter, requireAdmin, settingsController.updateSettings);
router.get('/page-permissions/effective', requireAuth, settingsController.getEffectiveRolePermissions);
router.get('/page-permissions', requireAuth, requireAdmin, settingsController.getRolePermissions);
router.put('/page-permissions', requireAuth, settingsMutationLimiter, requireAdmin, settingsController.updateRolePermissions);
router.post('/backup', requireAuth, settingsMutationLimiter, requireAdmin, settingsController.backupData);
router.post('/test-email', requireAuth, settingsMutationLimiter, requireAdmin, settingsController.testEmail);

export default router;
