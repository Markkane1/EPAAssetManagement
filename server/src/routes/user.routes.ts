import { Router } from 'express';
import { userController } from '../controllers/user.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);
router.get('/', userController.list);
router.post('/', userController.create);
router.put('/:id/role', userController.updateRole);
router.put('/:id/location', userController.updateLocation);
router.put('/:id/password', userController.resetPassword);
router.delete('/:id', userController.remove);

export default router;
