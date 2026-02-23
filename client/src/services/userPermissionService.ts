import api from "@/lib/api";

export type PermissionAction = "view" | "create" | "edit" | "delete";

export interface RolePermission {
  id: string;
  name: string;
  description: string;
  sourceRoles?: string[];
  permissions: Record<string, PermissionAction[]>;
}

export interface RolePermissionResponse {
  roles: RolePermission[];
  updated_at: string | null;
  updated_by_user_id: string | null;
}

export interface EffectiveRolePermissionResponse {
  role: string;
  permissions: Record<string, PermissionAction[]>;
  allowed_pages: string[];
  updated_at: string | null;
  updated_by_user_id: string | null;
}

export const userPermissionService = {
  getRolePermissions: () =>
    api.get<RolePermissionResponse>("/settings/page-permissions"),
  updateRolePermissions: (payload: { roles: RolePermission[] }) =>
    api.put<RolePermissionResponse>("/settings/page-permissions", payload),
  getEffectiveRolePermissions: () =>
    api.get<EffectiveRolePermissionResponse>("/settings/page-permissions/effective"),
};

export default userPermissionService;
