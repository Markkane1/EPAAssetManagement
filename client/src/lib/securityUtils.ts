import { z } from 'zod';

// Login attempt tracking
const LOGIN_ATTEMPTS_KEY = 'login_attempts';
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

interface LoginAttemptData {
  count: number;
  lastAttempt: number;
  lockedUntil: number | null;
}

export const getLoginAttempts = (): LoginAttemptData => {
  try {
    const data = sessionStorage.getItem(LOGIN_ATTEMPTS_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch {
    // Ignore parse errors
  }
  return { count: 0, lastAttempt: 0, lockedUntil: null };
};

export const recordFailedAttempt = (): { isLocked: boolean; remainingAttempts: number; lockoutMinutes: number } => {
  const attempts = getLoginAttempts();
  const now = Date.now();
  
  // Reset if last attempt was more than lockout duration ago
  if (attempts.lastAttempt && (now - attempts.lastAttempt) > LOCKOUT_DURATION_MS) {
    attempts.count = 0;
    attempts.lockedUntil = null;
  }
  
  attempts.count += 1;
  attempts.lastAttempt = now;
  
  if (attempts.count >= MAX_ATTEMPTS) {
    attempts.lockedUntil = now + LOCKOUT_DURATION_MS;
  }
  
  sessionStorage.setItem(LOGIN_ATTEMPTS_KEY, JSON.stringify(attempts));
  
  return {
    isLocked: attempts.count >= MAX_ATTEMPTS,
    remainingAttempts: Math.max(0, MAX_ATTEMPTS - attempts.count),
    lockoutMinutes: Math.ceil(LOCKOUT_DURATION_MS / 60000)
  };
};

export const clearLoginAttempts = (): void => {
  sessionStorage.removeItem(LOGIN_ATTEMPTS_KEY);
};

export const isAccountLocked = (): { locked: boolean; remainingMinutes: number } => {
  const attempts = getLoginAttempts();
  const now = Date.now();
  
  if (attempts.lockedUntil && attempts.lockedUntil > now) {
    return {
      locked: true,
      remainingMinutes: Math.ceil((attempts.lockedUntil - now) / 60000)
    };
  }
  
  // Clear lockout if expired
  if (attempts.lockedUntil && attempts.lockedUntil <= now) {
    clearLoginAttempts();
  }
  
  return { locked: false, remainingMinutes: 0 };
};

// Input validation schemas
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .email('Please enter a valid email address')
    .max(255, 'Email must be less than 255 characters'),
  password: z
    .string()
    .min(1, 'Password is required')
    .max(128, 'Password must be less than 128 characters'),
});

export type LoginFormData = z.infer<typeof loginSchema>;

// Password strength checker
export const checkPasswordStrength = (password: string): {
  score: number;
  label: string;
  color: string;
} => {
  let score = 0;
  
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  
  if (score <= 2) return { score, label: 'Weak', color: 'bg-destructive' };
  if (score <= 4) return { score, label: 'Fair', color: 'bg-yellow-500' };
  return { score, label: 'Strong', color: 'bg-primary' };
};

// Security headers info (for reference - these should be set server-side)
export const RECOMMENDED_SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
