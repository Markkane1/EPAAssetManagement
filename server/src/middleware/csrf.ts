import { Request, Response, NextFunction } from 'express';

type RequestWithCookies = Request & { cookies?: Record<string, string> };

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function hasBearerToken(req: Request) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ');
}

export function requireCsrf(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    return next();
  }

  // Non-browser clients using bearer auth are not CSRF-prone.
  if (hasBearerToken(req)) {
    return next();
  }

  const cookieToken = (req as RequestWithCookies).cookies?.csrf_token;
  const headerToken = req.header('x-csrf-token');
  if (!cookieToken || !headerToken || headerToken !== cookieToken) {
    return res.status(403).json({ message: 'Invalid CSRF token' });
  }
  return next();
}
