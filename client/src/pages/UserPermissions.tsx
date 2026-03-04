import { Fragment, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  Download,
  Shield, 
  Search, 
  UserPlus, 
  Save, 
  Users,
  Eye,
  Pencil,
  Trash2,
  Plus
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { userService } from "@/services/userService";
import { normalizeRole } from "@/services/authService";
import {
  PAGE_ALLOWED_ROLES,
  setRuntimeRolePermissions,
  type AppPageKey,
} from "@/config/pagePermissions";
import { usePageSearch } from "@/contexts/PageSearchContext";
import {
  userPermissionService,
  type RolePermission,
} from "@/services/userPermissionService";
import { useIsMobile } from "@/hooks/use-mobile";
import { exportToCSV, exportToExcel } from "@/lib/exportUtils";

type PermissionType = "view" | "create" | "edit" | "delete";
type CoreRole = "org_admin" | "office_head" | "caretaker" | "employee";
type PageCategory = "Main" | "Inventory" | "Management" | "System";

interface PermissionPage {
  id: AppPageKey;
  name: string;
  category: PageCategory;
}

const appPages: PermissionPage[] = [
  { id: "dashboard", name: "Dashboard", category: "Main" },
  { id: "profile", name: "Profile", category: "Main" },
  { id: "inventory", name: "Inventory Hub", category: "Main" },
  { id: "requisitions", name: "Requisitions", category: "Main" },
  { id: "requisitions-new", name: "New Requisition", category: "Main" },
  { id: "returns", name: "Returns", category: "Main" },
  { id: "returns-new", name: "New Return Request", category: "Main" },
  { id: "returns-detail", name: "Return Detail", category: "Main" },
  { id: "assets", name: "Assets", category: "Inventory" },
  { id: "asset-items", name: "Asset Items", category: "Inventory" },
  { id: "consumables", name: "Consumables", category: "Inventory" },
  { id: "office-consumables", name: "Office Consumables", category: "Inventory" },
  { id: "assignments", name: "Assignments", category: "Inventory" },
  { id: "transfers", name: "Transfers", category: "Inventory" },
  { id: "maintenance", name: "Maintenance", category: "Inventory" },
  { id: "purchase-orders", name: "Purchase Orders", category: "Inventory" },
  { id: "employees", name: "Employees", category: "Management" },
  { id: "offices", name: "Offices", category: "Management" },
  { id: "rooms-sections", name: "Rooms & Sections", category: "Management" },
  { id: "categories", name: "Categories", category: "Management" },
  { id: "vendors", name: "Vendors", category: "Management" },
  { id: "projects", name: "Projects", category: "Management" },
  { id: "schemes", name: "Schemes", category: "Management" },
  { id: "reports", name: "Reports", category: "System" },
  { id: "compliance", name: "Compliance", category: "System" },
  { id: "settings", name: "Settings", category: "System" },
  { id: "audit-logs", name: "Audit Logs", category: "System" },
  { id: "user-permissions", name: "User Permissions", category: "System" },
  { id: "user-management", name: "User Management", category: "System" },
  { id: "user-activity", name: "User Activity", category: "System" },
];

interface UserRole {
  id: string;
  name: string;
  description: string;
  permissions: Record<string, PermissionType[]>;
  usersCount: number;
  sourceRoles?: string[];
}

const ALL_ACTIONS: PermissionType[] = ["view", "create", "edit", "delete"];
const CORE_ROLE_SET = new Set<CoreRole>([
  "org_admin",
  "office_head",
  "caretaker",
  "employee",
]);
const APP_PAGE_SET = new Set<string>(appPages.map((page) => page.id));

const ROLE_ACTION_OVERRIDES: Record<
  CoreRole,
  Partial<Record<AppPageKey, PermissionType[]>>
> = {
  org_admin: {},
  office_head: {
    "rooms-sections": ["view", "create", "edit", "delete"],
    assets: ["view", "create", "edit", "delete"],
    "asset-items": ["view", "create", "edit", "delete"],
    "office-consumables": ["view", "create", "edit", "delete"],
    requisitions: ["view", "edit"],
    returns: ["view", "edit"],
    "returns-detail": ["view", "edit"],
  },
  caretaker: {
    "rooms-sections": ["view", "create", "edit", "delete"],
    requisitions: ["view", "edit"],
    returns: ["view", "edit"],
    "returns-detail": ["view", "edit"],
  },
  employee: {
    "requisitions-new": ["view", "create"],
    "returns-new": ["view", "create"],
    profile: ["view", "edit"],
  },
};

function normalizePermissionList(actions: PermissionType[]) {
  const unique = new Set(actions);
  const hasMutatingAction =
    unique.has("create") || unique.has("edit") || unique.has("delete");
  if (hasMutatingAction) {
    unique.add("view");
  }
  return Array.from(unique);
}

function createEmptyPermissionMap() {
  return appPages.reduce((acc, page) => {
    acc[page.id] = [];
    return acc;
  }, {} as Record<string, PermissionType[]>);
}

function sanitizePermissionActions(actions: unknown): PermissionType[] {
  if (!Array.isArray(actions)) return [];
  const normalized = actions
    .map((entry) => String(entry || "").toLowerCase().trim())
    .filter((entry): entry is PermissionType =>
      ALL_ACTIONS.includes(entry as PermissionType)
    );
  return normalizePermissionList(Array.from(new Set(normalized)));
}

function sanitizePermissionMap(
  permissions: unknown
): Record<string, PermissionType[]> {
  const base = createEmptyPermissionMap();
  if (!permissions || typeof permissions !== "object") {
    return base;
  }
  Object.entries(permissions as Record<string, unknown>).forEach(
    ([pageId, actions]) => {
      if (!APP_PAGE_SET.has(pageId)) return;
      base[pageId] = sanitizePermissionActions(actions);
    }
  );

  const raw = permissions as Record<string, unknown>;
  const legacyAssetActions = sanitizePermissionActions(raw["office-assets"]);
  if (legacyAssetActions.length > 0) {
    base.assets = normalizePermissionList([
      ...(base.assets || []),
      ...legacyAssetActions,
    ]);
  }
  const legacyAssetItemActions = sanitizePermissionActions(raw["office-asset-items"]);
  if (legacyAssetItemActions.length > 0) {
    base["asset-items"] = normalizePermissionList([
      ...(base["asset-items"] || []),
      ...legacyAssetItemActions,
    ]);
  }

  return base;
}

function sanitizeSourceRoles(sourceRoles: unknown): string[] {
  if (!Array.isArray(sourceRoles)) return [];
  return Array.from(
    new Set(
      sourceRoles
        .map((entry) => String(entry || "").trim())
        .filter((entry): entry is CoreRole =>
          CORE_ROLE_SET.has(entry as CoreRole)
        )
    )
  );
}

function normalizeStoredRoles(rows: unknown): UserRole[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const id = String(record.id || "").trim();
      const name = String(record.name || "").trim();
      if (!id || !name) return null;
      const description = String(record.description || "").trim();
      return {
        id,
        name,
        description,
        usersCount: 0,
        sourceRoles: sanitizeSourceRoles(record.sourceRoles),
        permissions: sanitizePermissionMap(record.permissions),
      } as UserRole;
    })
    .filter((role): role is UserRole => Boolean(role));
}

function serializeRolesForSave(roles: UserRole[]): RolePermission[] {
  return roles.map((role) => ({
    id: String(role.id || "").trim(),
    name: String(role.name || "").trim(),
    description: String(role.description || "").trim(),
    sourceRoles: sanitizeSourceRoles(role.sourceRoles),
    permissions: sanitizePermissionMap(role.permissions),
  }));
}

function buildDefaultPermissions(role: CoreRole) {
  const permissions: Record<string, PermissionType[]> = {};
  appPages.forEach((page) => {
    if (role === "org_admin") {
      permissions[page.id] = [...ALL_ACTIONS];
      return;
    }
    const allowedRoles = PAGE_ALLOWED_ROLES[page.id] || [];
    permissions[page.id] = allowedRoles.includes(role) ? ["view"] : [];
  });

  const overrides = ROLE_ACTION_OVERRIDES[role] || {};
  Object.entries(overrides).forEach(([pageId, actions]) => {
    permissions[pageId] = normalizePermissionList(actions || []);
  });

  return permissions;
}

const initialRoles: UserRole[] = [
  {
    id: "org_admin",
    name: "Organization Admin",
    description: "Full platform administration across all offices.",
    usersCount: 0,
    sourceRoles: ["org_admin"],
    permissions: buildDefaultPermissions("org_admin"),
  },
  {
    id: "office_head",
    name: "Office Head",
    description: "Office-scoped operations, requisition actions, and room/section management.",
    usersCount: 0,
    sourceRoles: ["office_head"],
    permissions: buildDefaultPermissions("office_head"),
  },
  {
    id: "caretaker",
    name: "Caretaker",
    description: "Office-scoped requisition/return operations and room/section management.",
    usersCount: 0,
    sourceRoles: ["caretaker"],
    permissions: buildDefaultPermissions("caretaker"),
  },
  {
    id: "employee",
    name: "Employee",
    description: "Submit and track own requisitions/returns and view assigned workflows.",
    usersCount: 0,
    sourceRoles: ["employee"],
    permissions: buildDefaultPermissions("employee"),
  },
];

export default function UserPermissions() {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [roles, setRoles] = useState<UserRole[]>(initialRoles);
  const [selectedRole, setSelectedRole] = useState<string>("org_admin");
  const [hasHydratedFromServer, setHasHydratedFromServer] = useState(false);
  const pageSearch = usePageSearch();
  const searchQuery = pageSearch?.term || "";
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [isAddRoleOpen, setIsAddRoleOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDescription, setNewRoleDescription] = useState("");

  const { data: users = [] } = useQuery({
    queryKey: ["users-management"],
    queryFn: () => userService.getAll(),
  });
  const rolePermissionsQuery = useQuery({
    queryKey: ["settings", "page-permissions"],
    queryFn: () => userPermissionService.getRolePermissions(),
  });

  const savePermissionsMutation = useMutation({
    mutationFn: () =>
      userPermissionService.updateRolePermissions({
        roles: serializeRolesForSave(roles),
      }),
    onSuccess: (response) => {
      const hydratedRoles = normalizeStoredRoles(response.roles);
      if (hydratedRoles.length > 0) {
        setRoles(hydratedRoles);
        setRuntimeRolePermissions(response.roles);
        if (!hydratedRoles.some((role) => role.id === selectedRole)) {
          setSelectedRole(hydratedRoles[0].id);
        }
      }
      queryClient.setQueryData(["settings", "page-permissions"], response);
      toast.success("Permissions saved successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save permissions");
    },
  });

  useEffect(() => {
    if (hasHydratedFromServer) return;
    if (rolePermissionsQuery.isLoading) return;
    if (rolePermissionsQuery.isError) {
      setHasHydratedFromServer(true);
      toast.error("Failed to load saved permissions. Showing current defaults.");
      return;
    }

    const hydratedRoles = normalizeStoredRoles(rolePermissionsQuery.data?.roles);
    if (hydratedRoles.length > 0) {
      setRoles(hydratedRoles);
      if (!hydratedRoles.some((role) => role.id === selectedRole)) {
        setSelectedRole(hydratedRoles[0].id);
      }
    }
    setHasHydratedFromServer(true);
  }, [
    hasHydratedFromServer,
    rolePermissionsQuery.data?.roles,
    rolePermissionsQuery.isError,
    rolePermissionsQuery.isLoading,
    selectedRole,
  ]);

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    users.forEach((user) => {
      const role = normalizeRole(user.role || "employee");
      counts[role] = (counts[role] || 0) + 1;
    });
    return counts;
  }, [users]);

  const rolesWithCounts = useMemo(
    () =>
      roles.map((role) => ({
        ...role,
        usersCount: (role.sourceRoles || [role.id]).reduce((total, roleKey) => total + (roleCounts[roleKey] || 0), 0),
      })),
    [roles, roleCounts],
  );

  const currentRole = rolesWithCounts.find((r) => r.id === selectedRole);

  const filteredPages = appPages.filter((page) => {
    const matchesSearch = page.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === "all" || page.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const groupedPages = filteredPages.reduce((acc, page) => {
    if (!acc[page.category]) {
      acc[page.category] = [];
    }
    acc[page.category].push(page);
    return acc;
  }, {} as Record<string, typeof appPages>);

  const togglePermission = (pageId: string, permission: PermissionType) => {
    setRoles((prevRoles) =>
      prevRoles.map((role) => {
        if (role.id !== selectedRole) return role;

        const currentPermissions = role.permissions[pageId] || [];
        const hasPermission = currentPermissions.includes(permission);

        let newPermissions: PermissionType[];
        if (hasPermission) {
          newPermissions = currentPermissions.filter((p) => p !== permission);
        } else {
          newPermissions = [...currentPermissions, permission];
        }

        return {
          ...role,
          permissions: {
            ...role.permissions,
            [pageId]: newPermissions,
          },
        };
      })
    );
  };

  const hasPermission = (pageId: string, permission: PermissionType): boolean => {
    if (!currentRole) return false;
    return currentRole.permissions[pageId]?.includes(permission) || false;
  };

  const handleSavePermissions = () => {
    savePermissionsMutation.mutate();
  };

  const handleExportCSV = () => {
    if (!currentRole) return;
    exportToCSV(
      filteredPages.map((page) => ({
        role: currentRole.name,
        page: page.name,
        category: page.category,
        view: hasPermission(page.id, "view") ? "Yes" : "No",
        create: hasPermission(page.id, "create") ? "Yes" : "No",
        edit: hasPermission(page.id, "edit") ? "Yes" : "No",
        delete: hasPermission(page.id, "delete") ? "Yes" : "No",
      })),
      [
        { key: "role", header: "Role" },
        { key: "page", header: "Page" },
        { key: "category", header: "Category" },
        { key: "view", header: "View" },
        { key: "create", header: "Create" },
        { key: "edit", header: "Edit" },
        { key: "delete", header: "Delete" },
      ],
      `permissions-${currentRole.id}-${format(new Date(), "yyyy-MM-dd")}`
    );
  };

  const handleExportExcel = async () => {
    if (!currentRole) return;
    await exportToExcel(
      filteredPages.map((page) => ({
        role: currentRole.name,
        page: page.name,
        category: page.category,
        view: hasPermission(page.id, "view") ? "Yes" : "No",
        create: hasPermission(page.id, "create") ? "Yes" : "No",
        edit: hasPermission(page.id, "edit") ? "Yes" : "No",
        delete: hasPermission(page.id, "delete") ? "Yes" : "No",
      })),
      [
        { key: "role", header: "Role" },
        { key: "page", header: "Page" },
        { key: "category", header: "Category" },
        { key: "view", header: "View" },
        { key: "create", header: "Create" },
        { key: "edit", header: "Edit" },
        { key: "delete", header: "Delete" },
      ],
      `permissions-${currentRole.id}-${format(new Date(), "yyyy-MM-dd")}`
    );
  };

  const handleAddRole = () => {
    if (!newRoleName.trim()) {
      toast.error("Role name is required");
      return;
    }

    const newRole: UserRole = {
      id: newRoleName.toLowerCase().replace(/\s+/g, "-"),
      name: newRoleName,
      description: newRoleDescription,
      usersCount: 0,
      permissions: createEmptyPermissionMap(),
    };

    setRoles([...roles, newRole]);
    setSelectedRole(newRole.id);
    setNewRoleName("");
    setNewRoleDescription("");
    setIsAddRoleOpen(false);
    toast.success(`Role "${newRoleName}" created`);
  };

  const selectAllForPage = (pageId: string) => {
    setRoles((prevRoles) =>
      prevRoles.map((role) => {
        if (role.id !== selectedRole) return role;
        return {
          ...role,
          permissions: {
            ...role.permissions,
            [pageId]: ["view", "create", "edit", "delete"],
          },
        };
      })
    );
  };

  const clearAllForPage = (pageId: string) => {
    setRoles((prevRoles) =>
      prevRoles.map((role) => {
        if (role.id !== selectedRole) return role;
        return {
          ...role,
          permissions: {
            ...role.permissions,
            [pageId]: [],
          },
        };
      })
    );
  };

  return (
    <MainLayout title="User Permissions" description="Manage role-based access">
      <PageHeader
        title="User Permissions"
        description="Configure page-wise access permissions for user roles"
        extra={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Button variant="outline" onClick={() => void handleExportExcel()} disabled={!currentRole}>
              <Download className="h-4 w-4 mr-2" />
              Excel
            </Button>
            <Button variant="outline" onClick={handleExportCSV} disabled={!currentRole}>
              <Download className="h-4 w-4 mr-2" />
              CSV
            </Button>
            <Button
              onClick={handleSavePermissions}
              disabled={savePermissionsMutation.isPending || rolePermissionsQuery.isLoading}
            >
              <Save className="h-4 w-4 mr-2" />
              {savePermissionsMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Roles List */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-lg">Roles</CardTitle>
                <Dialog open={isAddRoleOpen} onOpenChange={setIsAddRoleOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create New Role</DialogTitle>
                      <DialogDescription>
                        Add a new user role with custom permissions
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Role Name</label>
                        <Input
                          placeholder="e.g., Supervisor"
                          value={newRoleName}
                          onChange={(e) => setNewRoleName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Description</label>
                        <Input
                          placeholder="Brief description of this role"
                          value={newRoleDescription}
                          onChange={(e) => setNewRoleDescription(e.target.value)}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsAddRoleOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleAddRole}>
                        <UserPlus className="h-4 w-4 mr-2" />
                        Create Role
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {rolesWithCounts.map((role) => (
                <button
                  key={`${role.id}-${role.name}`}
                  onClick={() => setSelectedRole(role.id)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedRole === role.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{role.name}</span>
                    <Badge variant="secondary" className={selectedRole === role.id ? "bg-primary-foreground/20 text-primary-foreground" : ""}>
                      <Users className="h-3 w-3 mr-1" />
                      {role.usersCount}
                    </Badge>
                  </div>
                  <p className={`text-xs mt-1 ${selectedRole === role.id ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                    {role.description}
                  </p>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Permissions Matrix */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle className="text-lg">
                      {currentRole?.name} Permissions
                    </CardTitle>
                    <CardDescription>{currentRole?.description}</CardDescription>
                  </div>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search pages..."
                    value={searchQuery}
                    onChange={(e) => pageSearch?.setTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="w-full sm:w-52">
                  <select
                    value={categoryFilter}
                    onChange={(event) => setCategoryFilter(event.target.value)}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="all">All Categories</option>
                    <option value="Main">Main</option>
                    <option value="Inventory">Inventory</option>
                    <option value="Management">Management</option>
                    <option value="System">System</option>
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isMobile ? (
                <div className="space-y-4">
                  {Object.entries(groupedPages).map(([category, pages]) => (
                    <div key={category} className="space-y-2">
                      <div className="rounded-md bg-muted/50 px-3 py-2 text-sm font-semibold">
                        {category}
                      </div>
                      {pages.map((page) => (
                        <div key={page.id} className="rounded-md border p-3">
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <p className="font-medium">{page.name}</p>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => selectAllForPage(page.id)}
                                className="text-xs h-7 px-2"
                              >
                                All
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => clearAllForPage(page.id)}
                                className="text-xs h-7 px-2"
                              >
                                None
                              </Button>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={hasPermission(page.id, "view")}
                                onCheckedChange={() => togglePermission(page.id, "view")}
                              />
                              <Eye className="h-4 w-4 text-muted-foreground" />
                              View
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={hasPermission(page.id, "create")}
                                onCheckedChange={() => togglePermission(page.id, "create")}
                              />
                              <Plus className="h-4 w-4 text-muted-foreground" />
                              Create
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={hasPermission(page.id, "edit")}
                                onCheckedChange={() => togglePermission(page.id, "edit")}
                              />
                              <Pencil className="h-4 w-4 text-muted-foreground" />
                              Edit
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={hasPermission(page.id, "delete")}
                                onCheckedChange={() => togglePermission(page.id, "delete")}
                              />
                              <Trash2 className="h-4 w-4 text-muted-foreground" />
                              Delete
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[200px]">Page / Module</TableHead>
                        <TableHead className="text-center w-[100px]">
                          <div className="flex items-center justify-center gap-1">
                            <Eye className="h-4 w-4" />
                            View
                          </div>
                        </TableHead>
                        <TableHead className="text-center w-[100px]">
                          <div className="flex items-center justify-center gap-1">
                            <Plus className="h-4 w-4" />
                            Create
                          </div>
                        </TableHead>
                        <TableHead className="text-center w-[100px]">
                          <div className="flex items-center justify-center gap-1">
                            <Pencil className="h-4 w-4" />
                            Edit
                          </div>
                        </TableHead>
                        <TableHead className="text-center w-[100px]">
                          <div className="flex items-center justify-center gap-1">
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </div>
                        </TableHead>
                        <TableHead className="w-[120px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(groupedPages).map(([category, pages]) => (
                        <Fragment key={category}>
                          <TableRow className="bg-muted/50">
                            <TableCell colSpan={6} className="font-semibold text-sm">
                              {category}
                            </TableCell>
                          </TableRow>
                          {pages.map((page) => (
                            <TableRow key={page.id}>
                              <TableCell className="font-medium">{page.name}</TableCell>
                              <TableCell className="text-center">
                                <Checkbox
                                  checked={hasPermission(page.id, "view")}
                                  onCheckedChange={() => togglePermission(page.id, "view")}
                                />
                              </TableCell>
                              <TableCell className="text-center">
                                <Checkbox
                                  checked={hasPermission(page.id, "create")}
                                  onCheckedChange={() => togglePermission(page.id, "create")}
                                />
                              </TableCell>
                              <TableCell className="text-center">
                                <Checkbox
                                  checked={hasPermission(page.id, "edit")}
                                  onCheckedChange={() => togglePermission(page.id, "edit")}
                                />
                              </TableCell>
                              <TableCell className="text-center">
                                <Checkbox
                                  checked={hasPermission(page.id, "delete")}
                                  onCheckedChange={() => togglePermission(page.id, "delete")}
                                />
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => selectAllForPage(page.id)}
                                    className="text-xs h-7 px-2"
                                  >
                                    All
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => clearAllForPage(page.id)}
                                    className="text-xs h-7 px-2"
                                  >
                                    None
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Legend */}
              <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  <span>View - Can see the page and data</span>
                </div>
                <div className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  <span>Create - Can add new records</span>
                </div>
                <div className="flex items-center gap-2">
                  <Pencil className="h-4 w-4" />
                  <span>Edit - Can modify existing records</span>
                </div>
                <div className="flex items-center gap-2">
                  <Trash2 className="h-4 w-4" />
                  <span>Delete - Can remove records</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
