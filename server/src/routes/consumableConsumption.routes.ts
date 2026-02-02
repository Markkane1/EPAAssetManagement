import { Router } from 'express';
import { consumableConsumptionController } from '../controllers/consumableConsumption.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth, consumableConsumptionController.list);
router.post('/', requireAuth, consumableConsumptionController.consume);

export default router;
