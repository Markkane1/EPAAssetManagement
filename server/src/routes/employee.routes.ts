import { Router } from 'express';
import { employeeController } from '../controllers/employee.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth, employeeController.list);
router.get('/directorate/:directorateId', requireAuth, employeeController.getByDirectorate);
router.get('/:id', requireAuth, employeeController.getById);
router.post('/', requireAuth, employeeController.create);
router.post('/:id/transfer', requireAuth, employeeController.transfer);
router.put('/:id', requireAuth, employeeController.update);
router.delete('/:id', requireAuth, employeeController.remove);

export default router;
