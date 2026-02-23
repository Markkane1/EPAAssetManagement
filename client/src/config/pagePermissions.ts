import type { AppRole } from "@/services/authService";

export type AppPageKey =
  | "dashboard"
  | "inventory"
  | "assets"
  | "asset-items"
  | "consumables"
  | "office-assets"
  | "office-asset-items"
  | "office-consumables"
  | "employees"
  | "assignments"
  | "transfers"
  | "maintenance"
  | "purchase-orders"
  | "offices"
  | "rooms-sections"
  | "categories"
  | "vendors"
  | "projects"
  | "schemes"
  | "reports"
  | "compliance"
  | "requisitions"
  | "requisitions-new"
  | "returns"
  | "returns-new"
  | "returns-detail"
  | "settings"
  | "audit-logs"
  | "user-permissions"
  | "user-management"
  | "user-activity"
  | "profile";

const allRoles: AppRole[] = ["org_admin", "office_head", "caretaker", "employee"];
const VALID_PERMISSION_ACTIONS = new Set(["view", "create", "edit", "delete"]);
type PermissionAction = "view" | "create" | "edit" | "delete";

type RuntimeRolePermission = {
  id: string;
  sourceRoles?: string[];
  permissions?: Record<string, PermissionAction[]>;
};

export const PAGE_ALLOWED_ROLES: Record<AppPageKey, AppRole[]> = {
  dashboard: allRoles,
  inventory: allRoles,
  assets: ["org_admin"],
  "asset-items": ["org_admin"],
  consumables: ["org_admin"],
  "office-assets": ["office_head"],
  "office-asset-items": ["office_head"],
  "office-consumables": ["office_head"],
  employees: allRoles,
  assignments: allRoles,
  transfers: allRoles,
  maintenance: allRoles,
  "purchase-orders": allRoles,
  offices: ["org_admin"],
  "rooms-sections": ["org_admin", "office_head", "caretaker"],
  categories: allRoles,
  vendors: allRoles,
  projects: allRoles,
  schemes: allRoles,
  reports: allRoles,
  compliance: allRoles,
  requisitions: allRoles,
  "requisitions-new": ["employee"],
  returns: ["org_admin", "office_head", "caretaker", "employee"],
  "returns-new": ["employee"],
  "returns-detail": ["org_admin", "office_head", "caretaker", "employee"],
  settings: allRoles,
  "audit-logs": allRoles,
  "user-permissions": ["org_admin"],
  "user-management": ["org_admin"],
  "user-activity": ["org_admin"],
  profile: allRoles,
};

let runtimeRolePermissions: RuntimeRolePermission[] | null = null;

function sanitizePermissionActions(raw: unknown): PermissionAction[] {
  if (!Array.isArray(raw)) return [];
  const normalized = raw
    .map((entry) => String(entry || "").trim().toLowerCase())
    .filter(
      (entry): entry is PermissionAction => VALID_PERMISSION_ACTIONS.has(entry)
    );
  return Array.from(new Set(normalized));
}

function sanitizeRuntimeRolePermissions(rows: RuntimeRolePermission[] | null) {
  if (!Array.isArray(rows)) return null;
  return rows
    .map((entry) => {
      const id = String(entry?.id || "").trim().toLowerCase();
      if (!id) return null;
      const sourceRoles = Array.isArray(entry?.sourceRoles)
        ? Array.from(
            new Set(
              entry.sourceRoles
                .map((role) => String(role || "").trim().toLowerCase())
                .filter(Boolean)
            )
          )
        : [];
      const permissions: Record<string, PermissionAction[]> = {};
      if (entry.permissions && typeof entry.permissions === "object") {
        Object.entries(entry.permissions).forEach(([page, actions]) => {
          if (!page) return;
          permissions[page] = sanitizePermissionActions(actions);
        });
      }
      return {
        id,
        sourceRoles,
        permissions,
      } as RuntimeRolePermission;
    })
    .filter((entry): entry is RuntimeRolePermission => Boolean(entry));
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

function hasViewPermission(actions: PermissionAction[]) {
  if (actions.includes("view")) return true;
  return (
    actions.includes("create") ||
    actions.includes("edit") ||
    actions.includes("delete")
  );
}

export function setRuntimeRolePermissions(
  rows: RuntimeRolePermission[] | null
) {
  runtimeRolePermissions = sanitizeRuntimeRolePermissions(rows);
}

export function canAccessPage(options: {
  page: AppPageKey;
  role: AppRole | null;
  isOrgAdmin: boolean;
}) {
  if (!options.role) return false;
  if (options.isOrgAdmin) return true;
  const runtimeRole = findRuntimeRolePermission(String(options.role));
  if (runtimeRole) {
    const actions = sanitizePermissionActions(
      runtimeRole.permissions?.[options.page] || []
    );
    return hasViewPermission(actions);
  }
  const allowed = PAGE_ALLOWED_ROLES[options.page] || [];
  return allowed.includes(options.role);
}
