import { NextFunction, Request, Response } from 'express';

type ErrorShape = Error & { status?: number; message?: string };

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  const typed = err as ErrorShape;
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
