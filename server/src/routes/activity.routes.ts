/*  */import { Router } from 'express';
import { activityController } from '../controllers/activity.controller';

const router = Router();

router.get('/', activityController.list);
router.get('/user/:userId', activityController.getByUser);
router.post('/', activityController.create);

export default router;
