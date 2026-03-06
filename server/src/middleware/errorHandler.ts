import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { env } from '../config/env';

type ErrorShape = Error & { status?: number; message?: string; details?: unknown };
type MongoDuplicateKeyError = ErrorShape & {
  code?: number;
  keyPattern?: Record<string, unknown>;
  keyValue?: Record<string, unknown>;
  name?: string;
  errors?: Record<string, { message?: string }>;
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

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ message: 'Payload Too Large' });
    }
    return res.status(400).json({ message: err.message || 'Invalid upload payload' });
  }

  if (typed.message && /^Invalid file (type|extension)/i.test(typed.message)) {
    return res.status(400).json({ message: typed.message });
  }

  if (typed.code === 11000) {
    return res.status(409).json({ message: formatDuplicateKeyMessage(typed) });
  }

  if (typed.name === 'ValidationError') {
    const validationMessages = Object.values(typed.errors || {})
      .map((entry) => entry?.message)
      .filter((message): message is string => Boolean(message));
    return res.status(400).json({
      message: validationMessages[0] || typed.message || 'Validation failed',
      details: validationMessages,
    });
  }

  if (typed.name === 'CastError') {
    return res.status(400).json({ message: typed.message || 'Invalid request value' });
  }

  const status = typed.status || 500;
  const isProd = env.nodeEnv === 'production';
  if (status >= 500) {
    console.error(err);
  }
  const message = status >= 500 && isProd
    ? 'Internal Server Error'
    : typed.message || 'Internal Server Error';
  const body: Record<string, unknown> = { message };
  if (status < 500 && typed.details !== undefined) {
    body.details = typed.details;
  }
  res.status(status).json(body);
}
