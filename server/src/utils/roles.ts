import { createHttpError } from './httpError';

export const USER_ROLE_VALUES = [
  'super_admin',
  'admin',
  'headoffice_admin',
  'location_admin',
  'office_head',
  'caretaker',
  'assistant_caretaker',
  'central_store_admin',
  'lab_manager',
  'lab_user',
  'auditor',
  'user',
  'viewer',
  'employee',
  'directorate_head',
  'manager',
] as const;

export type UserRoleValue = (typeof USER_ROLE_VALUES)[number];

const ROLE_SET = new Set<string>(USER_ROLE_VALUES);

function canonicalize(role?: string | null) {
  if (role === undefined || role === null) return null;
  const value = String(role).trim();
  if (!value) return null;
  return value === 'manager' ? 'admin' : value;
}

export function isKnownRole(role?: string | null) {
  const canonical = canonicalize(role);
  return canonical !== null && ROLE_SET.has(canonical);
}

export function normalizeRole(role?: string | null, fallback: Exclude<UserRoleValue, 'manager'> = 'user') {
  const canonical = canonicalize(role);
  if (!canonical) return fallback;
  if (!ROLE_SET.has(canonical)) {
    throw createHttpError(400, `Invalid role: ${role}`);
  }
  return canonical as Exclude<UserRoleValue, 'manager'>;
}

export function assertKnownRole(role?: string | null) {
  const canonical = canonicalize(role);
  if (!canonical || !ROLE_SET.has(canonical)) {
    throw createHttpError(400, `Invalid role: ${role}`);
  }
  return canonical as Exclude<UserRoleValue, 'manager'>;
}

