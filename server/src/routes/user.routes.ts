import { Router } from 'express';
import { userController } from '../controllers/user.controller';
import { requireAuth } from '../middleware/auth';
import { createScopedRateLimiter } from '../middleware/rateLimitProfiles';

const router = Router();
const userMutationLimiter = createScopedRateLimiter('users-mutation', {
  windowMs: 5 * 60 * 1000,
  max: 60,
  message: 'Too many user-management changes. Please try again later.',
});

router.use(requireAuth);
router.get('/', userController.list);
router.post('/', userMutationLimiter, userController.create);
router.put('/:id/role', userMutationLimiter, userController.updateRole);
router.put('/:id/location', userMutationLimiter, userController.updateLocation);
router.put('/:id/password', userMutationLimiter, userController.resetPassword);
router.delete('/:id', userMutationLimiter, userController.remove);

export default router;
