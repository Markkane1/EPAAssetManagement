import { createHttpError } from './httpError';

export const USER_ROLE_VALUES = [
  'org_admin',
  'head_office_admin',
  'office_head',
  'caretaker',
  'employee',
  'storekeeper',
  'inventory_controller',
  'procurement_officer',
  'compliance_auditor',
] as const;

export type UserRoleValue = (typeof USER_ROLE_VALUES)[number];

export const OFFICE_ADMIN_ROLE_VALUES = ['office_head', 'head_office_admin'] as const;
export const OFFICE_MANAGER_ROLE_VALUES = [
  ...OFFICE_ADMIN_ROLE_VALUES,
  'caretaker',
  'inventory_controller',
  'storekeeper',
] as const;

const ROLE_SET = new Set<string>(USER_ROLE_VALUES);
export const LEGACY_ROLE_ALIAS_MAP: Record<string, UserRoleValue> = {
  super_admin: 'org_admin',
  admin: 'org_admin',
  headoffice_admin: 'head_office_admin',
  head_office_admin: 'head_office_admin',
  auditor: 'org_admin',
  viewer: 'org_admin',
  directorate_head: 'office_head',
  location_admin: 'office_head',
  lab_manager: 'office_head',
  assistant_caretaker: 'caretaker',
  central_store_admin: 'caretaker',
  store_keeper: 'storekeeper',
  inventory_manager: 'inventory_controller',
  inventory_officer: 'inventory_controller',
  purchasing_officer: 'procurement_officer',
  compliance_officer: 'compliance_auditor',
  lab_user: 'caretaker',
  user: 'employee',
};

const ROLE_CAPABILITY_MAP: Record<UserRoleValue, UserRoleValue[]> = {
  org_admin: ['org_admin'],
  head_office_admin: ['head_office_admin', 'office_head'],
  office_head: ['office_head'],
  caretaker: ['caretaker'],
  employee: ['employee'],
  storekeeper: ['storekeeper', 'caretaker'],
  inventory_controller: ['inventory_controller', 'caretaker'],
  procurement_officer: ['procurement_officer'],
  compliance_auditor: ['compliance_auditor'],
};

export const RUNTIME_ROLE_FALLBACK_MAP: Partial<Record<UserRoleValue, UserRoleValue>> = {
  storekeeper: 'caretaker',
  inventory_controller: 'caretaker',
};

function normalizeCanonicalRole(role?: string | null) {
  if (role === undefined || role === null) return null;
  const value = String(role).trim().toLowerCase();
  if (!value) return null;
  if (ROLE_SET.has(value)) {
    return value as UserRoleValue;
  }
  return LEGACY_ROLE_ALIAS_MAP[value] || null;
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

export function normalizeRoles(input: unknown, fallbackRole?: string | null, options?: { allowEmpty?: boolean }) {
  const normalized = new Set<UserRoleValue>();
  if (Array.isArray(input)) {
    input.forEach((entry) => {
      const canonical = normalizeCanonicalRole(String(entry || ''));
      if (canonical) {
        normalized.add(canonical);
      }
    });
  }
  const fallbackCanonical = normalizeCanonicalRole(fallbackRole);
  if (fallbackCanonical) {
    normalized.add(fallbackCanonical);
  }
  if (normalized.size === 0 && !options?.allowEmpty) {
    normalized.add('employee');
  }
  return Array.from(normalized);
}

export function resolveActiveRole(inputRole: unknown, availableRoles: string[]) {
  const normalizedAvailableRoles = normalizeRoles(availableRoles);
  const desiredRole = normalizeCanonicalRole(String(inputRole || ''));
  if (desiredRole && normalizedAvailableRoles.includes(desiredRole)) {
    return desiredRole;
  }
  return normalizedAvailableRoles[0] || 'employee';
}

export function resolveRuntimeRole(role: string) {
  const normalized = normalizeRole(role);
  return RUNTIME_ROLE_FALLBACK_MAP[normalized] || normalized;
}

export function isGlobalAdminRole(role?: string | null) {
  return normalizeCanonicalRole(role) === 'org_admin';
}

export function isHeadOfficeAdminRole(role?: string | null) {
  return normalizeCanonicalRole(role) === 'head_office_admin';
}

export function isOfficeAdminRole(role?: string | null) {
  const normalized = normalizeCanonicalRole(role);
  return normalized === 'office_head' || normalized === 'head_office_admin';
}

export function expandRoleCapabilities(roles: string[]) {
  const capabilities = new Set<UserRoleValue>();
  normalizeRoles(roles).forEach((role) => {
    const mapped = ROLE_CAPABILITY_MAP[role] || [role];
    mapped.forEach((entry) => capabilities.add(entry));
  });
  return Array.from(capabilities);
}

export function hasRoleCapability(roles: string[], requiredRoles: string[]) {
  if (requiredRoles.length === 0) return true;
  const capabilities = new Set(expandRoleCapabilities(roles));
  const normalizedRequired = requiredRoles
    .map((role) => normalizeCanonicalRole(role))
    .filter((role): role is UserRoleValue => Boolean(role));
  if (normalizedRequired.length === 0) return false;
  return normalizedRequired.some((role) => capabilities.has(role));
}

export function buildUserRoleMatchFilter(roles: string[]) {
  const normalized = normalizeRoles(roles, null, { allowEmpty: true });
  if (normalized.length === 0) {
    return { _id: { $exists: false } };
  }
  if (normalized.length === 1) {
    return {
      $or: [{ role: normalized[0] }, { roles: normalized[0] }],
    };
  }
  return {
    $or: [{ role: { $in: normalized } }, { roles: { $in: normalized } }],
  };
}
