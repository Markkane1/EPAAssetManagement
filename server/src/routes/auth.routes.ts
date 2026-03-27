import { Router } from 'express';
import type { Request } from 'express';
import { authController } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/authorize';
import { requireCsrf } from '../middleware/csrf';
import { createScopedRateLimiter } from '../middleware/rateLimitProfiles';
import { createRateLimiter } from '../middleware/rateLimit';

const router = Router();

function readEmailKey(req: Request) {
  const body = (req.body || {}) as { email?: unknown };
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  return `auth:${req.path}:${req.ip || 'unknown'}:${email || 'no-email'}`;
}

const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts. Please try again later.',
  keyGenerator: readEmailKey,
});
const forgotPasswordLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: 'Too many reset requests. Please try again later.',
  keyGenerator: readEmailKey,
});
const resetPasswordLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: 'Too many reset attempts. Please try again later.',
});
const registerLimiter = createScopedRateLimiter('auth-register', {
  windowMs: 15 * 60 * 1000,
  max: 12,
  message: 'Too many registration attempts. Please try again later.',
});
const sessionMutationLimiter = createScopedRateLimiter('auth-session-mutation', {
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many session changes. Please try again later.',
});
const passwordChangeLimiter = createScopedRateLimiter('auth-password-change', {
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: 'Too many password change attempts. Please try again later.',
});

router.post('/register', requireAuth, requireCsrf, registerLimiter, requireAdmin, authController.register);
router.post('/login', loginLimiter, authController.login);
router.post('/forgot-password', forgotPasswordLimiter, authController.requestPasswordReset);
router.post('/reset-password', resetPasswordLimiter, authController.resetPassword);
router.get('/me', requireAuth, authController.me);
router.post('/change-password', requireAuth, requireCsrf, passwordChangeLimiter, authController.changePassword);
router.post('/active-role', requireAuth, requireCsrf, sessionMutationLimiter, authController.setActiveRole);
router.post('/logout', requireAuth, requireCsrf, sessionMutationLimiter, authController.logout);

export default router;
