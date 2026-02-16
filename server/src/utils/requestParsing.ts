import type { Request } from 'express';
import { createHttpError } from './httpError';

export function readParam(req: Pick<Request, 'params'>, key: string) {
  const raw = (req.params as Record<string, string | string[] | undefined>)[key];
  if (Array.isArray(raw)) return String(raw[0] || '').trim();
  return String(raw || '').trim();
}

export function parsePositiveInt(value: unknown, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.floor(parsed), max));
}

export const clampInt = parsePositiveInt;

type PaginationConfig = {
  defaultPage?: number;
  defaultLimit?: number;
  maxPage?: number;
  maxLimit?: number;
};

export function readPagination(query: Record<string, unknown>, config: PaginationConfig = {}) {
  const defaultPage = config.defaultPage ?? 1;
  const defaultLimit = config.defaultLimit ?? 100;
  const maxPage = config.maxPage ?? 100_000;
  const maxLimit = config.maxLimit ?? 500;
  const page = parsePositiveInt(query.page, defaultPage, maxPage);
  const limit = parsePositiveInt(query.limit, defaultLimit, maxLimit);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export function asNullableString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const parsed = String(value).trim();
  if (!parsed || parsed === 'null' || parsed === 'undefined') return null;
  return parsed;
}

export function asNonEmptyString(value: unknown, fieldName: string) {
  const parsed = String(value ?? '').trim();
  if (!parsed) {
    throw createHttpError(400, `${fieldName} is required`);
  }
  return parsed;
}

export function parseDateInput(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw createHttpError(400, `${fieldName} must be a valid date`);
  }
  return parsed;
}

export function parseBoolean(value: unknown, fieldName: string, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const parsed = value.trim().toLowerCase();
    if (parsed === 'true') return true;
    if (parsed === 'false' || parsed === '') return false;
  }
  if (value === undefined || value === null) return fallback;
  throw createHttpError(400, `${fieldName} must be a boolean`);
}

export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
