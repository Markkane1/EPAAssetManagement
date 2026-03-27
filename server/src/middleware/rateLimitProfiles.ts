import type { Request } from 'express';
import type { AuthRequest } from './auth';
import { createRateLimiter } from './rateLimit';

type ScopedRateLimitOptions = {
  windowMs: number;
  max: number;
  message: string;
  includeEmail?: boolean;
};

function readIp(req: Request) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function readUserId(req: Request) {
  return (req as AuthRequest).user?.userId || 'anonymous';
}

function readEmail(req: Request) {
  const body = (req.body || {}) as { email?: unknown };
  return typeof body.email === 'string' ? body.email.trim().toLowerCase() : 'no-email';
}

export function createScopedRateLimiter(scope: string, options: ScopedRateLimitOptions) {
  return createRateLimiter({
    windowMs: options.windowMs,
    max: options.max,
    message: options.message,
    keyGenerator: (req) => {
      const keyParts = [scope, readUserId(req), readIp(req)];
      if (options.includeEmail) {
        keyParts.push(readEmail(req));
      }
      return keyParts.join(':');
    },
  });
}
