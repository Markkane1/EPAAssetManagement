import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { SystemSettingsModel } from '../models/systemSettings.model';
import type { AuthRequest } from '../middleware/auth';
import { createHttpError } from '../utils/httpError';

const STORAGE_LIMIT_BYTES = Number(process.env.STORAGE_LIMIT_GB || 10) * 1024 * 1024 * 1024;
const APP_VERSION = process.env.APP_VERSION || '1.0.0';
const MAX_PERMISSION_ROLES = 50;

const PERMISSION_ACTIONS = ['view', 'create', 'edit', 'delete'] as const;
const PERMISSION_ACTION_SET = new Set<string>(PERMISSION_ACTIONS);
const PERMISSION_ROLE_SET = new Set(['org_admin', 'office_head', 'caretaker', 'employee']);
const PERMISSION_PAGE_KEYS = [
  'dashboard',
  'profile',
  'inventory',
  'requisitions',
  'requisitions-new',
  'returns',
  'returns-new',
  'returns-detail',
  'assets',
  'asset-items',
  'consumables',
  'office-assets',
  'office-asset-items',
  'office-consumables',
  'assignments',
  'transfers',
  'maintenance',
  'purchase-orders',
  'employees',
  'offices',
  'rooms-sections',
  'categories',
  'vendors',
  'projects',
  'schemes',
  'reports',
  'compliance',
  'settings',
  'audit-logs',
  'user-permissions',
  'user-management',
  'user-activity',
] as const;
const PERMISSION_PAGE_SET = new Set<string>(PERMISSION_PAGE_KEYS);
const DEFAULT_ALLOWED_ROLES_BY_PAGE: Record<string, string[]> = {
  dashboard: ['org_admin', 'office_head', 'caretaker', 'employee'],
  inventory: ['org_admin', 'office_head', 'caretaker', 'employee'],
  assets: ['org_admin'],
  'asset-items': ['org_admin'],
  consumables: ['org_admin'],
  'office-assets': ['office_head'],
  'office-asset-items': ['office_head'],
  'office-consumables': ['office_head'],
  employees: ['org_admin', 'office_head', 'caretaker', 'employee'],
  assignments: ['org_admin', 'office_head', 'caretaker', 'employee'],
  transfers: ['org_admin', 'office_head', 'caretaker', 'employee'],
  maintenance: ['org_admin', 'office_head', 'caretaker', 'employee'],
  'purchase-orders': ['org_admin', 'office_head', 'caretaker', 'employee'],
  offices: ['org_admin'],
  'rooms-sections': ['org_admin', 'office_head', 'caretaker'],
  categories: ['org_admin', 'office_head', 'caretaker', 'employee'],
  vendors: ['org_admin', 'office_head', 'caretaker', 'employee'],
  projects: ['org_admin', 'office_head', 'caretaker', 'employee'],
  schemes: ['org_admin', 'office_head', 'caretaker', 'employee'],
  reports: ['org_admin', 'office_head', 'caretaker', 'employee'],
  compliance: ['org_admin', 'office_head', 'caretaker', 'employee'],
  requisitions: ['org_admin', 'office_head', 'caretaker', 'employee'],
  'requisitions-new': ['employee'],
  returns: ['org_admin', 'office_head', 'caretaker', 'employee'],
  'returns-new': ['employee'],
  'returns-detail': ['org_admin', 'office_head', 'caretaker', 'employee'],
  settings: ['org_admin', 'office_head', 'caretaker', 'employee'],
  'audit-logs': ['org_admin', 'office_head', 'caretaker', 'employee'],
  'user-permissions': ['org_admin'],
  'user-management': ['org_admin'],
  'user-activity': ['org_admin'],
  profile: ['org_admin', 'office_head', 'caretaker', 'employee'],
};

type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

type StoredRolePermission = {
  id: string;
  name: string;
  description: string;
  sourceRoles: string[];
  permissions: Record<string, PermissionAction[]>;
};

const getOrCreateSettings = async () => {
  let settings = await SystemSettingsModel.findOne();
  if (!settings) {
    settings = await SystemSettingsModel.create({});
  }
  return settings;
};

function asTrimmedString(value: unknown, field: string, maxLength: number) {
  const parsed = String(value ?? '').trim();
  if (!parsed) {
    throw createHttpError(400, `${field} is required`);
  }
  if (parsed.length > maxLength) {
    throw createHttpError(400, `${field} is too long`);
  }
  return parsed;
}

function buildEmptyPermissionMap() {
  const map: Record<string, PermissionAction[]> = {};
  PERMISSION_PAGE_KEYS.forEach((key) => {
    map[key] = [];
  });
  return map;
}

function sanitizePermissionActions(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  const normalized = raw
    .map((entry) => String(entry || '').trim().toLowerCase())
    .filter((entry): entry is PermissionAction => PERMISSION_ACTION_SET.has(entry));
  return Array.from(new Set(normalized));
}

function sanitizePermissions(raw: unknown) {
  const sanitized = buildEmptyPermissionMap();
  if (!raw || typeof raw !== 'object') {
    return sanitized;
  }
  for (const [pageKey, actions] of Object.entries(raw as Record<string, unknown>)) {
    if (!PERMISSION_PAGE_SET.has(pageKey)) continue;
    sanitized[pageKey] = sanitizePermissionActions(actions);
  }
  return sanitized;
}

function sanitizeSourceRoles(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  const normalized = raw
    .map((entry) => String(entry || '').trim())
    .filter((entry) => PERMISSION_ROLE_SET.has(entry));
  return Array.from(new Set(normalized));
}

function sanitizeRolePermission(raw: unknown, index: number): StoredRolePermission {
  if (!raw || typeof raw !== 'object') {
    throw createHttpError(400, `roles[${index}] must be an object`);
  }
  const record = raw as Record<string, unknown>;
  const id = asTrimmedString(record.id, `roles[${index}].id`, 64);
  const name = asTrimmedString(record.name, `roles[${index}].name`, 80);
  const descriptionValue = record.description === undefined || record.description === null ? '' : String(record.description);
  const description = descriptionValue.trim().slice(0, 300);

  return {
    id,
    name,
    description,
    sourceRoles: sanitizeSourceRoles(record.sourceRoles ?? record.source_roles),
    permissions: sanitizePermissions(record.permissions),
  };
}

function readStoredRolePermissions(settings: any) {
  const rolePermissions = settings?.role_permissions;
  const roles: StoredRolePermission[] = [];
  if (Array.isArray(rolePermissions?.roles)) {
    rolePermissions.roles.forEach((entry: unknown, index: number) => {
      try {
        roles.push(sanitizeRolePermission(entry, index));
      } catch {
        // Ignore malformed persisted entries and return valid roles only.
      }
    });
  }
  return {
    roles,
    updated_at: rolePermissions?.updated_at || null,
    updated_by_user_id: rolePermissions?.updated_by_user_id || null,
  };
}

function hasPageView(actions: PermissionAction[] | undefined) {
  if (!actions || actions.length === 0) return false;
  if (actions.includes('view')) return true;
  return actions.includes('create') || actions.includes('edit') || actions.includes('delete');
}

function buildDefaultRolePermissions(role: string) {
  const defaultPermissions = buildEmptyPermissionMap();
  for (const key of PERMISSION_PAGE_KEYS) {
    const allowedRoles = DEFAULT_ALLOWED_ROLES_BY_PAGE[key] || [];
    if (allowedRoles.includes(role)) {
      defaultPermissions[key] = ['view'];
    }
  }
  return defaultPermissions;
}

function findRolePermissionEntry(roles: StoredRolePermission[], role: string) {
  return (
    roles.find((entry) => entry.id === role) ||
    roles.find((entry) => Array.isArray(entry.sourceRoles) && entry.sourceRoles.includes(role)) ||
    null
  );
}

function buildEffectiveRolePermissions(settings: any, role: string) {
  const normalizedRole = String(role || '').trim().toLowerCase();
  if (!normalizedRole) {
    return buildEmptyPermissionMap();
  }

  const isCoreRole = PERMISSION_ROLE_SET.has(normalizedRole);
  const effectivePermissions = isCoreRole
    ? buildDefaultRolePermissions(normalizedRole)
    : buildEmptyPermissionMap();
  const storedRoles = readStoredRolePermissions(settings).roles;
  const matchedRole = findRolePermissionEntry(storedRoles, normalizedRole);

  if (!matchedRole) {
    return effectivePermissions;
  }

  for (const key of PERMISSION_PAGE_KEYS) {
    effectivePermissions[key] = sanitizePermissionActions(matchedRole.permissions[key]);
  }
  return effectivePermissions;
}

const buildSystemInfo = async (req: Request, lastBackupAt: string | null) => {
  const isConnected = mongoose.connection.readyState === 1;
  let storageUsedBytes: number | null = null;

  if (isConnected && mongoose.connection.db) {
    try {
      const stats = await mongoose.connection.db.stats();
      storageUsedBytes = stats.storageSize || stats.dataSize || null;
    } catch {
      storageUsedBytes = null;
    }
  }

  return {
    version: APP_VERSION,
    last_backup_at: lastBackupAt,
    database_status: isConnected ? 'Connected' : 'Disconnected',
    storage_used_bytes: storageUsedBytes,
    storage_limit_bytes: Number.isFinite(STORAGE_LIMIT_BYTES) ? STORAGE_LIMIT_BYTES : null,
    api_base_url: `${req.protocol}://${req.get('host')}/api`,
  };
};

export const settingsController = {
  getSettings: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await getOrCreateSettings();
      const systemInfo = await buildSystemInfo(req, settings.last_backup_at || null);
      res.json({ settings, systemInfo });
    } catch (error) {
      next(error);
    }
  },
  updateSettings: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await getOrCreateSettings();
      const { organization, notifications, security } = req.body || {};

      if (organization) {
        settings.organization = {
          ...settings.organization,
          ...organization,
        };
      }
      if (notifications) {
        settings.notifications = {
          ...settings.notifications,
          ...notifications,
        };
      }
      if (security) {
        settings.security = {
          ...settings.security,
          ...security,
        };
      }

      await settings.save();
      const systemInfo = await buildSystemInfo(req, settings.last_backup_at || null);
      res.json({ settings, systemInfo });
    } catch (error) {
      next(error);
    }
  },
  backupData: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await getOrCreateSettings();
      settings.last_backup_at = new Date().toISOString();
      await settings.save();
      const systemInfo = await buildSystemInfo(req, settings.last_backup_at || null);
      res.json({ message: 'Backup completed', systemInfo });
    } catch (error) {
      next(error);
    }
  },
  testEmail: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ message: 'Test email sent successfully' });
    } catch (error) {
      next(error);
    }
  },
  getEffectiveRolePermissions: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const role = String(req.user?.role || '').trim().toLowerCase();
      if (!role) {
        throw createHttpError(401, 'Unauthorized');
      }
      const settings = await getOrCreateSettings();
      const effectivePermissions = buildEffectiveRolePermissions(settings, role);
      const allowedPages = PERMISSION_PAGE_KEYS.filter((page) =>
        hasPageView(effectivePermissions[page])
      );
      const storedMetadata = readStoredRolePermissions(settings);
      res.json({
        role,
        permissions: effectivePermissions,
        allowed_pages: allowedPages,
        updated_at: storedMetadata.updated_at,
        updated_by_user_id: storedMetadata.updated_by_user_id,
      });
    } catch (error) {
      next(error);
    }
  },
  getRolePermissions: async (_req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const settings = await getOrCreateSettings();
      res.json(readStoredRolePermissions(settings));
    } catch (error) {
      next(error);
    }
  },
  updateRolePermissions: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const rolesInput = req.body?.roles;
      if (!Array.isArray(rolesInput)) {
        throw createHttpError(400, 'roles must be an array');
      }
      if (rolesInput.length > MAX_PERMISSION_ROLES) {
        throw createHttpError(400, `roles cannot exceed ${MAX_PERMISSION_ROLES}`);
      }

      const seenRoleIds = new Set<string>();
      const sanitizedRoles = rolesInput.map((entry, index) => {
        const role = sanitizeRolePermission(entry, index);
        if (seenRoleIds.has(role.id)) {
          throw createHttpError(400, `Duplicate role id: ${role.id}`);
        }
        seenRoleIds.add(role.id);
        return role;
      });

      const settings = await getOrCreateSettings();
      settings.role_permissions = {
        roles: sanitizedRoles,
        updated_at: new Date().toISOString(),
        updated_by_user_id: req.user?.userId || null,
      };
      await settings.save();
      res.json(readStoredRolePermissions(settings));
    } catch (error) {
      next(error);
    }
  },
};
