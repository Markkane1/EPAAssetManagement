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
  | "approval-matrix"
  | "user-permissions"
  | "user-management"
  | "user-activity"
  | "profile";

const allRoles: AppRole[] = [
  "org_admin",
  "office_head",
  "caretaker",
  "employee",
  "storekeeper",
  "inventory_controller",
  "procurement_officer",
  "compliance_auditor",
];
const VALID_PERMISSION_ACTIONS = new Set(["view", "create", "edit", "delete"]);
type PermissionAction = "view" | "create" | "edit" | "delete";

type RuntimeRolePermission = {
  id: string;
  sourceRoles?: string[];
  permissions?: Record<string, PermissionAction[]>;
};

export const PAGE_ALLOWED_ROLES: Record<AppPageKey, AppRole[]> = {
  dashboard: ["org_admin", "office_head", "caretaker", "employee", "procurement_officer", "compliance_auditor"],
  inventory: ["org_admin", "office_head", "caretaker", "employee", "procurement_officer", "compliance_auditor"],
  assets: ["org_admin", "office_head", "caretaker"],
  "asset-items": ["org_admin", "office_head", "caretaker"],
  consumables: ["org_admin", "caretaker", "storekeeper", "inventory_controller"],
  "office-assets": [],
  "office-asset-items": [],
  "office-consumables": ["office_head"],
  employees: ["org_admin", "office_head", "caretaker"],
  assignments: allRoles,
  transfers: ["org_admin", "office_head", "caretaker"],
  maintenance: ["org_admin", "office_head", "caretaker", "employee", "compliance_auditor"],
  "purchase-orders": ["org_admin", "office_head", "caretaker", "procurement_officer"],
  offices: ["org_admin"],
  "rooms-sections": ["org_admin", "office_head", "caretaker"],
  categories: ["org_admin", "caretaker", "storekeeper", "inventory_controller"],
  vendors: ["org_admin", "office_head", "caretaker", "procurement_officer"],
  projects: ["org_admin", "caretaker", "procurement_officer"],
  schemes: ["org_admin", "caretaker", "procurement_officer"],
  reports: ["org_admin", "office_head", "caretaker", "employee", "procurement_officer", "compliance_auditor"],
  compliance: ["org_admin", "office_head", "caretaker", "employee", "compliance_auditor"],
  requisitions: ["org_admin", "office_head", "caretaker", "employee", "inventory_controller"],
  "requisitions-new": ["employee"],
  returns: ["org_admin", "office_head", "caretaker", "employee", "inventory_controller"],
  "returns-new": ["employee"],
  "returns-detail": ["org_admin", "office_head", "caretaker", "employee", "inventory_controller"],
  settings: ["org_admin", "office_head"],
  "audit-logs": ["org_admin", "office_head", "caretaker", "employee", "compliance_auditor"],
  "approval-matrix": [
    "org_admin",
    "office_head",
    "caretaker",
    "storekeeper",
    "inventory_controller",
    "procurement_officer",
    "compliance_auditor",
  ],
  "user-permissions": ["org_admin"],
  "user-management": ["org_admin"],
  "user-activity": ["org_admin", "compliance_auditor"],
  profile: ["org_admin", "office_head", "caretaker", "employee", "procurement_officer", "compliance_auditor"],
};

const PAGE_PERMISSION_ALIASES: Partial<Record<AppPageKey, AppPageKey[]>> = {
  assets: ["office-assets"],
  "asset-items": ["office-asset-items"],
  "office-assets": ["assets"],
  "office-asset-items": ["asset-items"],
};

const EMPLOYEE_RESTRICTED_PAGES = new Set<AppPageKey>([
  "assets",
  "asset-items",
  "office-assets",
  "office-asset-items",
  "transfers",
  "employees",
  "offices",
  "rooms-sections",
  "categories",
  "vendors",
  "projects",
  "schemes",
  "purchase-orders",
  "settings",
]);
const OFFICE_HEAD_RESTRICTED_PAGES = new Set<AppPageKey>([
  "categories",
  "projects",
  "schemes",
]);

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
  const currentRole = options.role;
  const candidatePages = [options.page, ...(PAGE_PERMISSION_ALIASES[options.page] || [])];
  if (
    currentRole === "employee" &&
    candidatePages.some((candidate) => EMPLOYEE_RESTRICTED_PAGES.has(candidate))
  ) {
    return false;
  }
  if (
    currentRole === "office_head" &&
    candidatePages.some((candidate) => OFFICE_HEAD_RESTRICTED_PAGES.has(candidate))
  ) {
    return false;
  }
  if (options.isOrgAdmin) return true;
  const runtimeRole = findRuntimeRolePermission(String(currentRole));
  if (runtimeRole) {
    return candidatePages.some((candidate) => {
      const actions = sanitizePermissionActions(runtimeRole.permissions?.[candidate] || []);
      return hasViewPermission(actions);
    });
  }
  return candidatePages.some((candidate) => {
    const allowed = PAGE_ALLOWED_ROLES[candidate] || [];
    return allowed.includes(currentRole);
  });
}
