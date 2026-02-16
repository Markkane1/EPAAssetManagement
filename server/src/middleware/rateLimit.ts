import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { RateLimitEntryModel } from '../models/rateLimitEntry.model';

type RateLimitOptions = {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const store = new Map<string, Bucket>();

function getClientKey(req: Request) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function getCurrentWindowStart(now: number, windowMs: number) {
  return Math.floor(now / windowMs) * windowMs;
}

function getMongoKey(req: Request, keyGenerator?: (req: Request) => string) {
  if (keyGenerator) return keyGenerator(req);
  return `${req.baseUrl || ''}${req.path}:${getClientKey(req)}`;
}

function getMemoryKey(req: Request, keyGenerator?: (req: Request) => string) {
  return getMongoKey(req, keyGenerator);
}

async function incrementMongoBucket(key: string, windowMs: number) {
  const nowMs = Date.now();
  const windowStartMs = getCurrentWindowStart(nowMs, windowMs);
  const windowStart = new Date(windowStartMs);
  const resetAt = new Date(windowStartMs + windowMs);
  const expiresAt = new Date(windowStartMs + windowMs + 60_000);
  const entry = await RateLimitEntryModel.findOneAndUpdate(
    { key, window_start: windowStart },
    {
      $setOnInsert: {
        key,
        window_start: windowStart,
        reset_at: resetAt,
        expires_at: expiresAt,
      },
      $inc: { count: 1 },
    },
    { upsert: true, new: true }
  ).lean() as { count?: number } | null;

  return {
    count: Number(entry?.count || 0),
    resetAtMs: resetAt.getTime(),
  };
}

function incrementMemoryBucket(key: string, windowMs: number) {
  const now = Date.now();
  const existing = store.get(key);

  if (!existing || existing.resetAt <= now) {
    const next = { count: 1, resetAt: now + windowMs };
    store.set(key, next);
    return next;
  }

  existing.count += 1;
  store.set(key, existing);
  return existing;
}

export function createRateLimiter(options: RateLimitOptions) {
  const message = options.message || 'Too many requests, please try again later';

  return async (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    try {
      if (env.rateLimitBackend === 'mongo') {
        const key = getMongoKey(req, options.keyGenerator);
        const bucket = await incrementMongoBucket(key, options.windowMs);
        if (bucket.count > options.max) {
          const retryAfter = Math.max(1, Math.ceil((bucket.resetAtMs - now) / 1000));
          res.setHeader('Retry-After', String(retryAfter));
          return res.status(429).json({ message });
        }
        return next();
      }
    } catch (error) {
      console.warn('[rateLimit] Falling back to in-memory limiter', error);
    }

    const key = getMemoryKey(req, options.keyGenerator);
    const bucket = incrementMemoryBucket(key, options.windowMs);
    if (bucket.count > options.max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ message });
    }
    return next();
  };
}
