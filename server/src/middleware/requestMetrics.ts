import type { NextFunction, Request, Response } from 'express';
import {
  recordCachePolicyMetric,
  recordCacheValidationMetric,
  recordHttpRequestMetric,
} from '../observability/metrics';

type ResponseWithCacheLocals = Response & {
  locals: Response['locals'] & {
    cachePolicyClass?: string;
  };
};

function resolveRouteLabel(req: Request) {
  const routePath = (req as Request & { route?: { path?: string } }).route?.path;
  const basePath = req.baseUrl || '';
  if (typeof routePath === 'string') {
    return `${basePath}${routePath}` || '/';
  }

  const pathname = req.originalUrl.split('?')[0];
  if (!pathname) return '/';
  return pathname.length > 160 ? pathname.slice(0, 160) : pathname;
}

function hasIfNoneMatchHeader(req: Request) {
  const value = req.headers['if-none-match'];
  if (Array.isArray(value)) return value.some((entry) => String(entry || '').trim().length > 0);
  return String(value || '').trim().length > 0;
}

export function observeRequestMetrics(req: Request, res: Response, next: NextFunction) {
  const startedAtNs = process.hrtime.bigint();
  const metricsRes = res as ResponseWithCacheLocals;

  res.on('finish', () => {
    const elapsedNs = process.hrtime.bigint() - startedAtNs;
    const durationMs = Number(elapsedNs) / 1_000_000;
    const route = resolveRouteLabel(req);
    recordHttpRequestMetric(req.method, route, res.statusCode, durationMs);

    if (req.method !== 'GET' && req.method !== 'HEAD') return;
    const cachePolicyClass = String(metricsRes.locals.cachePolicyClass || 'unknown');
    recordCachePolicyMetric(cachePolicyClass);

    if (hasIfNoneMatchHeader(req)) {
      recordCacheValidationMetric(cachePolicyClass, res.statusCode === 304 ? 'hit' : 'miss');
      return;
    }
    recordCacheValidationMetric(cachePolicyClass, 'skip');
  });

  next();
}

