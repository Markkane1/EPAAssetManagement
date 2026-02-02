import { Router } from 'express';
import { consumableController } from '../controllers/consumable.controller';

const router = Router();

router.get('/', consumableController.list);
router.get('/:id', consumableController.getById);
router.post('/', consumableController.create);
router.put('/:id', consumableController.update);
router.delete('/:id', consumableController.remove);

export default router;
