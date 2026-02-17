import { NextFunction, Request, Response } from 'express';
import { ZodError, ZodSchema } from 'zod';

type ValidationSource = 'body' | 'query' | 'params';

function toPathLabel(path: Array<string | number>) {
  if (!path.length) return '_root';
  return path.map((segment) => String(segment)).join('.');
}

function buildValidationResponse(error: ZodError, source: ValidationSource) {
  const issues = error.issues.map((issue) => ({
    path: toPathLabel(issue.path),
    message: issue.message,
    code: issue.code,
  }));

  const firstIssue = issues[0];
  const firstMessage = firstIssue
    ? `${firstIssue.path === '_root' ? 'request' : firstIssue.path}: ${firstIssue.message}`
    : 'Validation error';

  return {
    message: firstMessage,
    error: 'VALIDATION_ERROR',
    source,
    errors: error.flatten().fieldErrors,
    issues,
  };
}

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json(buildValidationResponse(result.error, 'body'));
    }
    req.body = result.data as unknown as Request['body'];
    return next();
  };
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json(buildValidationResponse(result.error, 'query'));
    }
    req.query = result.data as unknown as Request['query'];
    return next();
  };
}

export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      return res.status(400).json(buildValidationResponse(result.error, 'params'));
    }
    req.params = result.data as unknown as Request['params'];
    return next();
  };
}
