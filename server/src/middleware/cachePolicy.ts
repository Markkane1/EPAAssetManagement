import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';

const REFERENCE_ROUTE_PREFIXES = [
  '/api/categories',
  '/api/divisions',
  '/api/districts',
  '/api/offices',
  '/api/vendors',
  '/api/projects',
  '/api/schemes',
  '/api/consumables/units',
  '/api/consumables/reason-codes',
];

const NO_STORE_ROUTE_PREFIXES = [
  '/api/auth',
  '/api/users',
  '/api/settings',
];

const DYNAMIC_REVALIDATE_PREFIXES = [
  '/api/dashboard',
  '/api/activities',
  '/api/notifications',
  '/api/reports',
  '/api/requisitions',
  '/api/return-requests',
  '/api/assignments',
  '/api/transfers',
  '/api/maintenance',
];

function isReferenceRoute(pathname: string) {
  return REFERENCE_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isNoStoreRoute(pathname: string) {
  return NO_STORE_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
    || pathname.includes('/download')
    || pathname.startsWith('/api/documents');
}

function isDynamicRevalidateRoute(pathname: string) {
  return DYNAMIC_REVALIDATE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function addVaryHeader(res: Response, value: string) {
  const existing = String(res.getHeader('Vary') || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (!existing.includes(value)) {
    existing.push(value);
  }
  if (existing.length > 0) {
    res.setHeader('Vary', existing.join(', '));
  }
}

function setCachePolicyClass(res: Response, policyClass: string) {
  (res as Response & { locals: Response['locals'] & { cachePolicyClass?: string } }).locals.cachePolicyClass =
    policyClass;
}

export function applyCachePolicy(req: Request, res: Response, next: NextFunction) {
  addVaryHeader(res, 'Origin');
  addVaryHeader(res, 'Accept-Encoding');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    setCachePolicyClass(res, 'no_store');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    next();
    return;
  }

  if (res.getHeader('Cache-Control')) {
    next();
    return;
  }

  const pathname = `${req.baseUrl || ''}${req.path || ''}`;

  if (isNoStoreRoute(pathname)) {
    setCachePolicyClass(res, 'no_store');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Pragma', 'no-cache');
    next();
    return;
  }

  if (isReferenceRoute(pathname)) {
    setCachePolicyClass(res, 'reference');
    res.setHeader(
      'Cache-Control',
      `private, max-age=${env.cacheReferenceMaxAgeSeconds}, stale-while-revalidate=${env.cacheReferenceStaleWhileRevalidateSeconds}`
    );
    next();
    return;
  }

  if (isDynamicRevalidateRoute(pathname)) {
    setCachePolicyClass(res, 'revalidate');
    res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');
    next();
    return;
  }

  setCachePolicyClass(res, 'revalidate');
  res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');
  next();
}
