import { SystemSettingsModel } from '../models/systemSettings.model';
import {
  AUTHORIZATION_PAGE_KEY_SET,
  AUTHORIZATION_PERMISSION_ACTIONS,
  AUTHORIZATION_ROLE_ID_SET,
} from '../config/authorizationCatalog';

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete';

type StoredRolePermission = {
  id: string;
  sourceRoles: string[];
  permissions: Record<string, PermissionAction[]>;
};

type StoredRolePermissionsContext = {
  roles: StoredRolePermission[];
};

const PERMISSION_ACTION_SET = new Set<PermissionAction>(AUTHORIZATION_PERMISSION_ACTIONS);

function sanitizePermissionActions(raw: unknown): PermissionAction[] {
  if (!Array.isArray(raw)) return [];
  const normalized = raw
    .map((entry) => String(entry || '').trim().toLowerCase())
    .filter((entry): entry is PermissionAction => PERMISSION_ACTION_SET.has(entry as PermissionAction));
  return Array.from(new Set(normalized));
}

function sanitizeSourceRoles(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .map((entry) => String(entry || '').trim().toLowerCase())
        .filter((entry) => AUTHORIZATION_ROLE_ID_SET.has(entry))
    )
  );
}

function sanitizePermissions(raw: unknown) {
  const permissions: Record<string, PermissionAction[]> = {};
  if (!raw || typeof raw !== 'object') {
    return permissions;
  }
  for (const [pageKey, actions] of Object.entries(raw as Record<string, unknown>)) {
    if (!pageKey || !AUTHORIZATION_PAGE_KEY_SET.has(pageKey)) continue;
    permissions[pageKey] = sanitizePermissionActions(actions);
  }
  return permissions;
}

function sanitizeRolePermission(raw: unknown): StoredRolePermission | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const id = String(record.id || '').trim().toLowerCase();
  if (!id) return null;
  return {
    id,
    sourceRoles: sanitizeSourceRoles(record.sourceRoles ?? record.source_roles),
    permissions: sanitizePermissions(record.permissions),
  };
}

function readStoredRolePermissions(settings: any): StoredRolePermissionsContext {
  const rolePermissions = settings?.role_permissions;
  const roles: StoredRolePermission[] = [];
  if (Array.isArray(rolePermissions?.roles)) {
    for (const entry of rolePermissions.roles) {
      const sanitized = sanitizeRolePermission(entry);
      if (sanitized) roles.push(sanitized);
    }
  }
  return { roles };
}

export async function loadStoredRolePermissionsContext(): Promise<StoredRolePermissionsContext> {
  const settings = await SystemSettingsModel.findOne({}, { role_permissions: 1 }).lean();
  return readStoredRolePermissions(settings);
}

export function resolveStoredRolePermissionEntry(context: StoredRolePermissionsContext, role: string) {
  const normalizedRole = String(role || '').trim().toLowerCase();
  if (!normalizedRole) return null;
  return (
    context.roles.find((entry) => entry.id === normalizedRole) ||
    context.roles.find((entry) => entry.sourceRoles.includes(normalizedRole)) ||
    null
  );
}

export function resolveStoredRolePageActions(
  context: StoredRolePermissionsContext,
  role: string,
  page: string
): PermissionAction[] {
  const entry = resolveStoredRolePermissionEntry(context, role);
  if (!entry) return [];
  return sanitizePermissionActions(entry.permissions?.[page] || []);
}

export function hasPermissionAction(actions: PermissionAction[] | undefined, required: PermissionAction) {
  const safeActions = Array.isArray(actions) ? actions : [];
  if (required === 'view') {
    if (safeActions.includes('view')) return true;
    return safeActions.includes('create') || safeActions.includes('edit') || safeActions.includes('delete');
  }
  return safeActions.includes(required);
}
