import { Router } from 'express';
import { officeController } from '../controllers/office.controller';

const router = Router();

router.get('/', officeController.list);
router.get('/:id', officeController.getById);
router.post('/', officeController.create);
router.put('/:id', officeController.update);
router.delete('/:id', officeController.remove);

export default router;
