import { Router } from 'express';
import { employeeController } from '../controllers/employee.controller';

const router = Router();

router.get('/', employeeController.list);
router.get('/directorate/:directorateId', employeeController.getByDirectorate);
router.get('/:id', employeeController.getById);
router.post('/', employeeController.create);
router.put('/:id', employeeController.update);
router.delete('/:id', employeeController.remove);

export default router;
