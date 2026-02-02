import { Router } from 'express';
import { assignmentController } from '../controllers/assignment.controller';

const router = Router();

router.get('/', assignmentController.list);
router.get('/employee/:employeeId', assignmentController.getByEmployee);
router.get('/asset-item/:assetItemId', assignmentController.getByAssetItem);
router.get('/:id', assignmentController.getById);
router.post('/', assignmentController.create);
router.put('/:id', assignmentController.update);
router.put('/:id/return', assignmentController.returnAsset);
router.put('/:id/reassign', assignmentController.reassign);
router.delete('/:id', assignmentController.remove);

export default router;
