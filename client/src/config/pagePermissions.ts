import type { AppRole } from "@/services/authService";

export type AppPageKey = string;
export type PermissionAction = "view" | "create" | "edit" | "delete";

export interface AuthorizationCatalogRole {
  id: string;
  name: string;
  description: string;
  source_roles: string[];
  system: boolean;
  default_permissions: Record<string, PermissionAction[]>;
}

export interface AuthorizationCatalogPage {
  id: string;
  name: string;
  category: string;
  aliases: string[];
  default_allowed_roles: string[];
}

export interface AuthorizationCatalog {
  permission_actions: PermissionAction[];
  roles: AuthorizationCatalogRole[];
  pages: AuthorizationCatalogPage[];
}

export interface AuthorizationPolicyDocument {
  version: number;
  permission_actions: PermissionAction[];
  roles: Array<{
    id: string;
    name: string;
    description: string;
    source_roles: string[];
    system: boolean;
    default_permissions?: Record<string, PermissionAction[]>;
  }>;
  pages: AuthorizationCatalogPage[];
  scopes: Array<{
    id: string;
    name: string;
    description: string;
  }>;
  resource_groups: Array<{
    id: string;
    name: string;
    description: string;
    route_prefixes: string[];
    page_ids: string[];
  }>;
  alias_groups?: Record<string, string>;
  fixed_restrictions?: Record<string, string[]>;
  workflow?: Record<string, unknown>;
  migration?: Record<string, unknown>;
}

export type RuntimeRolePermission = {
  id: string;
  sourceRoles?: string[];
  permissions?: Record<string, PermissionAction[]>;
};

export interface RuntimeAuthorizationStateSnapshot {
  user_id: string;
  role: string;
  active_role: string | null;
  allowed_pages: string[];
  catalog: AuthorizationCatalog | null;
  policy: AuthorizationPolicyDocument | null;
  role_permissions: RuntimeRolePermission[];
  saved_at: string;
}

const RUNTIME_AUTHORIZATION_CACHE_KEY = "ams.runtime.authorization";
const VALID_PERMISSION_ACTIONS = new Set<PermissionAction>([
  "view",
  "create",
  "edit",
  "delete",
]);

let runtimeRolePermissions: RuntimeRolePermission[] | null = null;
let runtimeAuthorizationCatalog: AuthorizationCatalog | null = null;
let runtimeAuthorizationPolicy: AuthorizationPolicyDocument | null = null;
let runtimeAllowedPages: Set<string> | null = null;

function sanitizePermissionActions(raw: unknown): PermissionAction[] {
  if (!Array.isArray(raw)) return [];
  const normalized = raw
    .map((entry) => String(entry || "").trim().toLowerCase())
    .filter(
      (entry): entry is PermissionAction =>
        VALID_PERMISSION_ACTIONS.has(entry as PermissionAction)
    );
  return Array.from(new Set(normalized));
}

function sanitizeStringArray(raw: unknown, lowercase = false) {
  if (!Array.isArray(raw)) return [];
  const normalized = raw
    .map((entry) => String(entry || "").trim())
    .map((entry) => (lowercase ? entry.toLowerCase() : entry))
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function sanitizeRuntimeRolePermissions(rows: unknown): RuntimeRolePermission[] | null {
  if (!Array.isArray(rows)) return null;
  return rows
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const id = String(record.id || "").trim().toLowerCase();
      if (!id) return null;
      const permissions: Record<string, PermissionAction[]> = {};
      if (record.permissions && typeof record.permissions === "object") {
        Object.entries(record.permissions as Record<string, unknown>).forEach(
          ([page, actions]) => {
            if (!page) return;
            permissions[page] = sanitizePermissionActions(actions);
          }
        );
      }
      return {
        id,
        sourceRoles: sanitizeStringArray(
          record.sourceRoles ?? record.source_roles,
          true
        ),
        permissions,
      } satisfies RuntimeRolePermission;
    })
    .filter((entry): entry is RuntimeRolePermission => Boolean(entry));
}

function sanitizeAuthorizationCatalog(
  catalog: AuthorizationCatalog | null
): AuthorizationCatalog | null {
  if (!catalog || typeof catalog !== "object") return null;
  const permission_actions = sanitizePermissionActions(catalog.permission_actions);
  const roles = Array.isArray(catalog.roles)
    ? catalog.roles
        .map((role) => {
          const id = String(role?.id || "").trim().toLowerCase();
          const name = String(role?.name || "").trim();
          if (!id || !name) return null;
          const default_permissions: Record<string, PermissionAction[]> = {};
          if (
            role?.default_permissions &&
            typeof role.default_permissions === "object"
          ) {
            Object.entries(role.default_permissions).forEach(([page, actions]) => {
              if (!page) return;
              default_permissions[page] = sanitizePermissionActions(actions);
            });
          }
          return {
            id,
            name,
            description: String(role?.description || "").trim(),
            source_roles: sanitizeStringArray(role?.source_roles, true),
            system: Boolean(role?.system),
            default_permissions,
          } satisfies AuthorizationCatalogRole;
        })
        .filter((entry): entry is AuthorizationCatalogRole => Boolean(entry))
    : [];
  const pages = Array.isArray(catalog.pages)
    ? catalog.pages
        .map((page) => {
          const id = String(page?.id || "").trim();
          const name = String(page?.name || "").trim();
          if (!id || !name) return null;
          return {
            id,
            name,
            category: String(page?.category || "System").trim() || "System",
            aliases: sanitizeStringArray(page?.aliases),
            default_allowed_roles: sanitizeStringArray(
              page?.default_allowed_roles,
              true
            ),
          } satisfies AuthorizationCatalogPage;
        })
        .filter((entry): entry is AuthorizationCatalogPage => Boolean(entry))
    : [];

  return {
    permission_actions:
      permission_actions.length > 0
        ? permission_actions
        : ["view", "create", "edit", "delete"],
    roles,
    pages,
  };
}

function sanitizeAuthorizationPolicy(
  policy: AuthorizationPolicyDocument | null
): AuthorizationPolicyDocument | null {
  if (!policy || typeof policy !== "object") return null;
  const catalog = sanitizeAuthorizationCatalog({
    permission_actions: Array.isArray(policy.permission_actions)
      ? policy.permission_actions
      : ["view", "create", "edit", "delete"],
    roles: Array.isArray(policy.roles)
      ? policy.roles.map((role) => ({
          id: String(role?.id || "").trim(),
          name: String(role?.name || "").trim(),
          description: String(role?.description || "").trim(),
          source_roles: sanitizeStringArray(role?.source_roles, true),
          system: Boolean(role?.system),
          default_permissions:
            role?.default_permissions && typeof role.default_permissions === "object"
              ? role.default_permissions
              : {},
        }))
      : [],
    pages: Array.isArray(policy.pages) ? policy.pages : [],
  });
  return {
    version: Number(policy.version || 1),
    permission_actions: catalog?.permission_actions || [
      "view",
      "create",
      "edit",
      "delete",
    ],
    roles:
      catalog?.roles.map((role) => ({
        id: role.id,
        name: role.name,
        description: role.description,
        source_roles: role.source_roles,
        system: role.system,
        default_permissions: role.default_permissions,
      })) || [],
    pages: catalog?.pages || [],
    scopes: Array.isArray(policy.scopes)
      ? policy.scopes
          .map((scope) => ({
            id: String(scope?.id || "").trim(),
            name: String(scope?.name || "").trim(),
            description: String(scope?.description || "").trim(),
          }))
          .filter((scope) => scope.id && scope.name)
      : [],
    resource_groups: Array.isArray(policy.resource_groups)
      ? policy.resource_groups
          .map((group) => ({
            id: String(group?.id || "").trim(),
            name: String(group?.name || "").trim(),
            description: String(group?.description || "").trim(),
            route_prefixes: sanitizeStringArray(group?.route_prefixes),
            page_ids: sanitizeStringArray(group?.page_ids),
          }))
          .filter((group) => group.id && group.name)
      : [],
    alias_groups:
      policy.alias_groups && typeof policy.alias_groups === "object"
        ? Object.fromEntries(
            Object.entries(policy.alias_groups).filter(
              ([alias, target]) =>
                String(alias || "").trim() && String(target || "").trim()
            )
          )
        : {},
    fixed_restrictions:
      policy.fixed_restrictions && typeof policy.fixed_restrictions === "object"
        ? Object.fromEntries(
            Object.entries(policy.fixed_restrictions).map(([key, value]) => [
              key,
              sanitizeStringArray(value),
            ])
          )
        : {},
    workflow:
      policy.workflow && typeof policy.workflow === "object"
        ? policy.workflow
        : {},
    migration:
      policy.migration && typeof policy.migration === "object"
        ? policy.migration
        : {},
  };
}

function sanitizeRuntimeAuthorizationSnapshot(
  raw: unknown
): RuntimeAuthorizationStateSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const userId = String(record.user_id || "").trim();
  const role = String(record.role || "").trim().toLowerCase();
  if (!userId || !role) return null;
  return {
    user_id: userId,
    role,
    active_role: (() => {
      const activeRole = String(record.active_role || "").trim().toLowerCase();
      return activeRole || null;
    })(),
    allowed_pages: sanitizeStringArray(record.allowed_pages),
    catalog: sanitizeAuthorizationCatalog(
      (record.catalog as AuthorizationCatalog | null) || null
    ),
    policy: sanitizeAuthorizationPolicy(
      (record.policy as AuthorizationPolicyDocument | null) || null
    ),
    role_permissions:
      sanitizeRuntimeRolePermissions(record.role_permissions) || [],
    saved_at: String(record.saved_at || "").trim() || new Date().toISOString(),
  };
}

function findRuntimeRolePermission(role: string) {
  if (!runtimeRolePermissions) return null;
  const normalizedRole = String(role || "").trim().toLowerCase();
  if (!normalizedRole) return null;
  return (
    runtimeRolePermissions.find((entry) => entry.id === normalizedRole) ||
    runtimeRolePermissions.find((entry) =>
      Array.isArray(entry.sourceRoles)
        ? entry.sourceRoles.includes(normalizedRole)
        : false
    ) ||
    null
  );
}

function findCatalogRole(role: string) {
  if (!runtimeAuthorizationCatalog) return null;
  const normalizedRole = String(role || "").trim().toLowerCase();
  if (!normalizedRole) return null;
  return (
    runtimeAuthorizationCatalog.roles.find((entry) => entry.id === normalizedRole) ||
    runtimeAuthorizationCatalog.roles.find((entry) =>
      entry.source_roles.includes(normalizedRole)
    ) ||
    null
  );
}

function hasViewPermission(actions: PermissionAction[]) {
  if (actions.includes("view")) return true;
  return (
    actions.includes("create") ||
    actions.includes("edit") ||
    actions.includes("delete")
  );
}

function resolveAliasGroups() {
  if (runtimeAuthorizationPolicy?.alias_groups) {
    return runtimeAuthorizationPolicy.alias_groups;
  }
  return {
    "office-assets": "assets",
    "office-asset-items": "asset-items",
    "office-consumables": "consumables",
  } satisfies Record<string, string>;
}

function resolveCandidatePages(page: AppPageKey) {
  const normalizedPage = String(page || "").trim();
  if (!normalizedPage) return [];
  const candidates = new Set<string>([normalizedPage]);
  const aliasGroups = resolveAliasGroups();
  const linkedPage = aliasGroups[normalizedPage];
  if (linkedPage) {
    candidates.add(linkedPage);
  }
  Object.entries(aliasGroups).forEach(([alias, target]) => {
    if (target === normalizedPage) {
      candidates.add(alias);
    }
  });
  runtimeAuthorizationCatalog?.pages.forEach((entry) => {
    if (entry.id === normalizedPage) {
      entry.aliases.forEach((alias) => candidates.add(alias));
    }
    if (entry.aliases.includes(normalizedPage)) {
      candidates.add(entry.id);
      entry.aliases.forEach((alias) => candidates.add(alias));
    }
  });
  return Array.from(candidates);
}

export function setRuntimeAuthorizationCatalog(catalog: AuthorizationCatalog | null) {
  runtimeAuthorizationCatalog = sanitizeAuthorizationCatalog(catalog);
}

export function getRuntimeAuthorizationCatalog() {
  return runtimeAuthorizationCatalog;
}

export function setRuntimeAuthorizationPolicy(
  policy: AuthorizationPolicyDocument | null
) {
  runtimeAuthorizationPolicy = sanitizeAuthorizationPolicy(policy);
}

export function getRuntimeAuthorizationPolicy() {
  return runtimeAuthorizationPolicy;
}

export function setRuntimeAllowedPages(pages: string[] | null) {
  runtimeAllowedPages = Array.isArray(pages)
    ? new Set(sanitizeStringArray(pages))
    : null;
}

export function setRuntimeRolePermissions(rows: RuntimeRolePermission[] | null) {
  runtimeRolePermissions = sanitizeRuntimeRolePermissions(rows);
}

export function clearRuntimeAuthorizationState() {
  runtimeRolePermissions = null;
  runtimeAuthorizationCatalog = null;
  runtimeAuthorizationPolicy = null;
  runtimeAllowedPages = null;
}

export function createRuntimeAuthorizationStateSnapshot(input: {
  userId: string;
  role: string;
  activeRole?: string | null;
  allowedPages?: string[] | null;
  catalog?: AuthorizationCatalog | null;
  policy?: AuthorizationPolicyDocument | null;
  rolePermissions?: RuntimeRolePermission[] | null;
}) {
  return sanitizeRuntimeAuthorizationSnapshot({
    user_id: input.userId,
    role: input.role,
    active_role: input.activeRole || null,
    allowed_pages: input.allowedPages || [],
    catalog: input.catalog || null,
    policy: input.policy || null,
    role_permissions: input.rolePermissions || [],
    saved_at: new Date().toISOString(),
  });
}

export function hydrateRuntimeAuthorizationState(
  input:
    | RuntimeAuthorizationStateSnapshot
    | {
        userId: string;
        activeRole?: string | null;
      }
    | null
) {
  let sanitized: RuntimeAuthorizationStateSnapshot | null = null;
  if (input && "allowed_pages" in input) {
    sanitized = sanitizeRuntimeAuthorizationSnapshot(input);
  } else if (input?.userId) {
    const cached = getCachedRuntimeAuthorizationState();
    if (
      cached &&
      cached.user_id === String(input.userId).trim() &&
      (!input.activeRole || cached.active_role === String(input.activeRole).trim().toLowerCase())
    ) {
      sanitized = cached;
    }
  }
  if (!sanitized) return null;
  setRuntimeAuthorizationCatalog(sanitized.catalog);
  setRuntimeAuthorizationPolicy(sanitized.policy);
  setRuntimeAllowedPages(sanitized.allowed_pages);
  setRuntimeRolePermissions(sanitized.role_permissions);
  return sanitized;
}

export function getCachedRuntimeAuthorizationState() {
  try {
    const raw = localStorage.getItem(RUNTIME_AUTHORIZATION_CACHE_KEY);
    if (!raw) return null;
    return sanitizeRuntimeAuthorizationSnapshot(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function cacheRuntimeAuthorizationState(input: {
  userId: string;
  role?: string | null;
  activeRole?: string | null;
  allowedPages?: string[] | null;
  catalog?: AuthorizationCatalog | null;
  policy?: AuthorizationPolicyDocument | null;
  rolePermissions?: RuntimeRolePermission[] | null;
}) {
  const fallbackRole =
    String(input.role || "").trim().toLowerCase() ||
    String(input.activeRole || "").trim().toLowerCase() ||
    String(input.rolePermissions?.[0]?.id || "").trim().toLowerCase();
  const snapshot = createRuntimeAuthorizationStateSnapshot({
    userId: input.userId,
    role: fallbackRole || "employee",
    activeRole: input.activeRole || null,
    allowedPages: input.allowedPages || [],
    catalog: input.catalog || null,
    policy: input.policy || null,
    rolePermissions: input.rolePermissions || [],
  });
  if (!snapshot) return null;
  try {
    localStorage.setItem(
      RUNTIME_AUTHORIZATION_CACHE_KEY,
      JSON.stringify(snapshot)
    );
  } catch {
    return null;
  }
  return snapshot;
}

export function clearCachedRuntimeAuthorizationState() {
  try {
    localStorage.removeItem(RUNTIME_AUTHORIZATION_CACHE_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
}

export function getAuthorizationPages() {
  return runtimeAuthorizationCatalog?.pages || [];
}

export function getAuthorizationRoles() {
  return runtimeAuthorizationCatalog?.roles || [];
}

export function buildDefaultPermissionsForRole(role: string) {
  const normalizedRole = String(role || "").trim().toLowerCase();
  const permissions: Record<string, PermissionAction[]> = {};
  const pages = getAuthorizationPages();
  if (pages.length === 0) {
    return permissions;
  }
  const catalogRole = findCatalogRole(normalizedRole);
  pages.forEach((page) => {
    const defaultActions = sanitizePermissionActions(
      catalogRole?.default_permissions?.[page.id] || []
    );
    permissions[page.id] =
      defaultActions.length > 0
        ? defaultActions
        : page.default_allowed_roles.includes(normalizedRole)
          ? ["view"]
          : [];
    page.aliases.forEach((alias) => {
      permissions[alias] = [...permissions[page.id]];
    });
  });
  return permissions;
}

export function canAccessPage(options: {
  page: AppPageKey;
  role: AppRole | null;
  isOrgAdmin: boolean;
}) {
  const normalizedRole = String(options.role || "").trim().toLowerCase();
  if (!normalizedRole) return false;
  const candidatePages = resolveCandidatePages(options.page);
  if (candidatePages.length === 0) return false;
  if (options.isOrgAdmin) return true;

  const runtimeRole = findRuntimeRolePermission(normalizedRole);
  if (runtimeRole) {
    return candidatePages.some((candidate) => {
      const actions = sanitizePermissionActions(
        runtimeRole.permissions?.[candidate] || []
      );
      return hasViewPermission(actions);
    });
  }

  if (runtimeAllowedPages) {
    return candidatePages.some((candidate) => runtimeAllowedPages.has(candidate));
  }

  const catalogRole = findCatalogRole(normalizedRole);
  if (catalogRole) {
    return candidatePages.some((candidate) =>
      hasViewPermission(
        sanitizePermissionActions(catalogRole.default_permissions?.[candidate] || [])
      )
    );
  }

  return false;
}
