import { Router } from 'express';
import { consumableAssignmentController } from '../controllers/consumableAssignment.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth, consumableAssignmentController.list);
router.post('/transfer-batch', requireAuth, consumableAssignmentController.transferBatch);
router.post('/', requireAuth, consumableAssignmentController.create);
router.delete('/:id', requireAuth, consumableAssignmentController.remove);

export default router;
