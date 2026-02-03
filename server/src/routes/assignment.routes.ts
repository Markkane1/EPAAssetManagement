import { Router } from 'express';
import { assignmentController } from '../controllers/assignment.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth, assignmentController.list);
router.get('/employee/:employeeId', requireAuth, assignmentController.getByEmployee);
router.get('/asset-item/:assetItemId', requireAuth, assignmentController.getByAssetItem);
router.get('/:id', requireAuth, assignmentController.getById);
router.post('/', requireAuth, assignmentController.create);
router.put('/:id', requireAuth, assignmentController.update);
router.put('/:id/return', requireAuth, assignmentController.returnAsset);
router.put('/:id/reassign', requireAuth, assignmentController.reassign);
router.delete('/:id', requireAuth, assignmentController.remove);

export default router;
