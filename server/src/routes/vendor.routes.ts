import { Router } from 'express';
import { vendorController } from '../controllers/vendor.controller';

const router = Router();

router.get('/', vendorController.list);
router.get('/:id', vendorController.getById);
router.post('/', vendorController.create);
router.put('/:id', vendorController.update);
router.delete('/:id', vendorController.remove);

export default router;
