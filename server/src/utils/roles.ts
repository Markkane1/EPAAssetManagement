import { createHttpError } from './httpError';

export const USER_ROLE_VALUES = [
  'org_admin',
  'office_head',
  'caretaker',
  'employee',
] as const;

export type UserRoleValue = (typeof USER_ROLE_VALUES)[number];

const ROLE_SET = new Set<string>(USER_ROLE_VALUES);

function canonicalize(role?: string | null) {
  if (role === undefined || role === null) return null;
  const value = String(role).trim().toLowerCase();
  if (!value) return null;
  if (ROLE_SET.has(value)) return value as UserRoleValue;
  return null;
}

export function isKnownRole(role?: string | null) {
  const canonical = canonicalize(role);
  return canonical !== null && ROLE_SET.has(canonical);
}

export function normalizeRole(role?: string | null, fallback: UserRoleValue = 'employee') {
  const canonical = canonicalize(role);
  if (!canonical) return fallback;
  if (!ROLE_SET.has(canonical)) {
    throw createHttpError(400, `Invalid role: ${role}`);
  }
  return canonical as UserRoleValue;
}

export function assertKnownRole(role?: string | null) {
  const canonical = canonicalize(role);
  if (!canonical || !ROLE_SET.has(canonical)) {
    throw createHttpError(400, `Invalid role: ${role}`);
  }
  return canonical as UserRoleValue;
}
