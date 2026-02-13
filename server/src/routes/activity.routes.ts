/*  */import { Router } from 'express';
import { activityController } from '../controllers/activity.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/', activityController.list);
router.get('/user/:userId', activityController.getByUser);
router.post('/', activityController.create);

export default router;
