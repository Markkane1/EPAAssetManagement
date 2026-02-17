import { NextFunction, Request, Response } from 'express';

type ErrorShape = Error & { status?: number; message?: string };
type MongoDuplicateKeyError = ErrorShape & {
  code?: number;
  keyPattern?: Record<string, unknown>;
  keyValue?: Record<string, unknown>;
};

function formatDuplicateKeyMessage(err: MongoDuplicateKeyError) {
  const keyPattern = err.keyPattern || {};
  const keyValue = err.keyValue || {};
  const key = Object.keys(keyPattern)[0] || Object.keys(keyValue)[0] || 'value';
  const value = keyValue[key];
  const label = key.replace(/_/g, ' ');
  if (value === null || value === undefined || value === '') {
    return `${label} already exists`;
  }
  return `${label} "${String(value)}" already exists`;
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  const typed = err as MongoDuplicateKeyError;

  if (typed.code === 11000) {
    return res.status(409).json({ message: formatDuplicateKeyMessage(typed) });
  }

  const status = typed.status || 500;
  const isProd = process.env.NODE_ENV === 'production';
  if (status >= 500) {
    console.error(err);
  }
  const message = status >= 500 && isProd
    ? 'Internal Server Error'
    : typed.message || 'Internal Server Error';
  res.status(status).json({ message });
}
