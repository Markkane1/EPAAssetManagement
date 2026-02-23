import { createHttpError } from './httpError';

export const USER_ROLE_VALUES = [
  'org_admin',
  'office_head',
  'caretaker',
  'employee',
] as const;

export type UserRoleValue = (typeof USER_ROLE_VALUES)[number];

const ROLE_SET = new Set<string>(USER_ROLE_VALUES);

function normalizeCanonicalRole(role?: string | null) {
  if (role === undefined || role === null) return null;
  const value = String(role).trim().toLowerCase();
  return value || null;
}

export function isKnownRole(role?: string | null) {
  const canonical = normalizeCanonicalRole(role);
  if (!canonical) return false;
  return ROLE_SET.has(canonical);
}

export function normalizeRole(role?: string | null) {
  const canonical = normalizeCanonicalRole(role);
  if (!canonical) {
    throw createHttpError(400, `Invalid role: ${role}`);
  }
  return canonical;
}

export function assertKnownRole(role?: string | null) {
  const canonical = normalizeCanonicalRole(role);
  if (!canonical || !ROLE_SET.has(canonical)) {
    throw createHttpError(400, `Invalid role: ${role}`);
  }
  return canonical as UserRoleValue;
}
