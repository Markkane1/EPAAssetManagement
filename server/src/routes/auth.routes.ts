import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/authorize';
import { createRateLimiter } from '../middleware/rateLimit';

const router = Router();
const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts. Please try again later.',
});
const forgotPasswordLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: 'Too many reset requests. Please try again later.',
});

router.post('/register', requireAuth, requireAdmin, authController.register);
router.post('/login', loginLimiter, authController.login);
router.post('/forgot-password', forgotPasswordLimiter, authController.requestPasswordReset);
router.get('/me', requireAuth, authController.me);
router.post('/change-password', requireAuth, authController.changePassword);
router.post('/logout', requireAuth, authController.logout);

export default router;
