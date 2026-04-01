import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireCsrf } from '../middleware/csrf';
import { notificationController } from '../controllers/notification.controller';

const router = Router();

router.use(requireAuth);
router.get('/', notificationController.list);
router.post('/read-all', requireCsrf, notificationController.markAllRead);
router.post('/:id/read', requireCsrf, notificationController.markRead);
router.post('/:id/action', requireCsrf, notificationController.action);

export default router;
