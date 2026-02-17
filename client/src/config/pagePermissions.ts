import type { AppRole } from "@/services/authService";

export type AppPageKey =
  | "dashboard"
  | "inventory"
  | "assets"
  | "asset-items"
  | "consumables"
  | "employees"
  | "assignments"
  | "transfers"
  | "maintenance"
  | "purchase-orders"
  | "offices"
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

export const PAGE_ALLOWED_ROLES: Record<AppPageKey, AppRole[]> = {
  dashboard: allRoles,
  inventory: allRoles,
  assets: allRoles,
  "asset-items": allRoles,
  consumables: allRoles,
  employees: allRoles,
  assignments: allRoles,
  transfers: allRoles,
  maintenance: allRoles,
  "purchase-orders": allRoles,
  offices: ["org_admin"],
  categories: allRoles,
  vendors: allRoles,
  projects: allRoles,
  schemes: allRoles,
  reports: allRoles,
  compliance: allRoles,
  requisitions: allRoles,
  "requisitions-new": ["employee", "office_head", "caretaker"],
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

export function canAccessPage(options: {
  page: AppPageKey;
  role: AppRole | null;
  isOrgAdmin: boolean;
}) {
  if (options.isOrgAdmin) return true;
  if (!options.role) return false;
  const allowed = PAGE_ALLOWED_ROLES[options.page] || [];
  return allowed.includes(options.role);
}
