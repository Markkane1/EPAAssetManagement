import { NextFunction, Request, Response } from 'express';

type ErrorShape = Error & { status?: number; message?: string };

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  const typed = err as ErrorShape;
  const status = typed.status || 500;
  const message = typed.message || 'Internal Server Error';
  res.status(status).json({ message });
}
