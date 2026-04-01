import { Fragment, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Download,
  Eye,
  Pencil,
  Plus,
  Save,
  Search,
  Shield,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
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
  buildDefaultPermissionsForRole,
  getAuthorizationPages,
  getAuthorizationRoles,
  type AppPageKey,
} from "@/config/pagePermissions";
import { usePageSearch } from "@/contexts/PageSearchContext";
import { normalizeRole } from "@/services/authService";
import { type RolePermission } from "@/services/userPermissionService";
import { useIsMobile } from "@/hooks/use-mobile";
import { exportToCSV } from "@/lib/exportUtils";
import { useUsersLookup } from "@/hooks/useUsers";
import {
  useRolePermissionsCatalog,
  useUpdateRolePermissionsCatalog,
} from "@/hooks/useUserPermissionsAdmin";

type PermissionType = "view" | "create" | "edit" | "delete";

interface PermissionPage {
  id: AppPageKey;
  name: string;
  category: string;
}

interface CatalogRole {
  id: string;
  name: string;
  description: string;
  source_roles: string[];
  system: boolean;
}

interface UserRole {
  id: string;
  name: string;
  description: string;
  permissions: Record<string, PermissionType[]>;
  usersCount: number;
  sourceRoles?: string[];
  system?: boolean;
}

const ALL_ACTIONS: PermissionType[] = ["view", "create", "edit", "delete"];

function normalizePermissionList(actions: PermissionType[]) {
  const unique = new Set(actions);
  const hasMutatingAction =
    unique.has("create") || unique.has("edit") || unique.has("delete");
  if (hasMutatingAction) {
    unique.add("view");
  }
  return Array.from(unique);
}

function createEmptyPermissionMap(appPages: PermissionPage[]) {
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
  permissions: unknown,
  appPages: PermissionPage[]
): Record<string, PermissionType[]> {
  const pageSet = new Set<string>(appPages.map((page) => page.id));
  const base = createEmptyPermissionMap(appPages);
  if (!permissions || typeof permissions !== "object") {
    return base;
  }
  Object.entries(permissions as Record<string, unknown>).forEach(
    ([pageId, actions]) => {
      if (!pageSet.has(pageId)) return;
      base[pageId] = sanitizePermissionActions(actions);
    }
  );
  return base;
}

function sanitizeSourceRoles(sourceRoles: unknown, validRoleIds: Set<string>): string[] {
  if (!Array.isArray(sourceRoles)) return [];
  return Array.from(
    new Set(
      sourceRoles
        .map((entry) => String(entry || "").trim())
        .filter((entry) => validRoleIds.has(entry))
    )
  );
}

function normalizeStoredRoles(
  rows: unknown,
  appPages: PermissionPage[],
  validRoleIds: Set<string>,
  systemRoleIds: Set<string>
): UserRole[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const id = String(record.id || "").trim();
      const name = String(record.name || "").trim();
      if (!id || !name) return null;
      return {
        id,
        name,
        description: String(record.description || "").trim(),
        usersCount: 0,
        system: systemRoleIds.has(id),
        sourceRoles: sanitizeSourceRoles(record.sourceRoles, validRoleIds),
        permissions: sanitizePermissionMap(record.permissions, appPages),
      } as UserRole;
    })
    .filter((role): role is UserRole => Boolean(role));
}

function serializeRolesForSave(
  roles: UserRole[],
  validRoleIds: Set<string>,
  appPages: PermissionPage[]
): RolePermission[] {
  return roles.map((role) => ({
    id: String(role.id || "").trim(),
    name: String(role.name || "").trim(),
    description: String(role.description || "").trim(),
    sourceRoles: sanitizeSourceRoles(role.sourceRoles, validRoleIds),
    permissions: sanitizePermissionMap(role.permissions, appPages),
  }));
}

function buildDefaultRoles(appPages: PermissionPage[], catalogRoles: CatalogRole[]): UserRole[] {
  return catalogRoles.map((role) => ({
    id: role.id,
    name: role.name,
    description: role.description,
    usersCount: 0,
    system: role.system,
    sourceRoles: role.source_roles,
    permissions: Object.fromEntries(
      appPages.map((page) => [
        page.id,
        normalizePermissionList(
          sanitizePermissionActions(buildDefaultPermissionsForRole(role.id)[page.id] || [])
        ),
      ])
    ),
  }));
}

export default function UserPermissions() {
  const isMobile = useIsMobile();
  const pageSearch = usePageSearch();
  const searchQuery = pageSearch?.term || "";
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [hasHydratedFromServer, setHasHydratedFromServer] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [isAddRoleOpen, setIsAddRoleOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDescription, setNewRoleDescription] = useState("");

  const { data: users = [] } = useUsersLookup();
  const rolePermissionsQuery = useRolePermissionsCatalog();
  const savePermissionsMutation = useUpdateRolePermissionsCatalog();

  const appPages = useMemo<PermissionPage[]>(() => {
    const pages =
      rolePermissionsQuery.data?.catalog?.pages?.length
        ? rolePermissionsQuery.data.catalog.pages
        : getAuthorizationPages();
    return pages.map((page) => ({
      id: page.id,
      name: page.name,
      category: String(page.category || "System"),
    }));
  }, [rolePermissionsQuery.data?.catalog]);

  const catalogRoles = useMemo<CatalogRole[]>(() => {
    const roles =
      rolePermissionsQuery.data?.catalog?.roles?.length
        ? rolePermissionsQuery.data.catalog.roles
        : getAuthorizationRoles();
    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      source_roles: role.source_roles,
      system: role.system,
    }));
  }, [rolePermissionsQuery.data?.catalog]);

  const validRoleIds = useMemo(
    () =>
      new Set(
        catalogRoles.flatMap((role) => [role.id, ...(role.source_roles || [])])
      ),
    [catalogRoles]
  );
  const systemRoleIds = useMemo(
    () => new Set(catalogRoles.filter((role) => role.system).map((role) => role.id)),
    [catalogRoles]
  );
  const defaultRoles = useMemo(
    () => buildDefaultRoles(appPages, catalogRoles),
    [appPages, catalogRoles]
  );

  useEffect(() => {
    if (hasHydratedFromServer) return;
    if (rolePermissionsQuery.isLoading) return;
    if (appPages.length === 0 || catalogRoles.length === 0) return;

    if (rolePermissionsQuery.isError) {
      setRoles(defaultRoles);
      setSelectedRole(defaultRoles[0]?.id || "");
      setHasHydratedFromServer(true);
      toast.error("Failed to load saved permissions. Showing current defaults.");
      return;
    }

    const hydratedRoles = normalizeStoredRoles(
      rolePermissionsQuery.data?.roles,
      appPages,
      validRoleIds,
      systemRoleIds
    );
    const nextRoles = hydratedRoles.length > 0 ? hydratedRoles : defaultRoles;
    setRoles(nextRoles);
    if (!nextRoles.some((role) => role.id === selectedRole)) {
      setSelectedRole(nextRoles[0]?.id || "");
    }
    setHasHydratedFromServer(true);
  }, [
    appPages,
    catalogRoles.length,
    defaultRoles,
    hasHydratedFromServer,
    rolePermissionsQuery.data?.roles,
    rolePermissionsQuery.isError,
    rolePermissionsQuery.isLoading,
    selectedRole,
    systemRoleIds,
    validRoleIds,
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
        usersCount: (role.sourceRoles || [role.id]).reduce(
          (total, roleKey) => total + (roleCounts[roleKey] || 0),
          0
        ),
      })),
    [roles, roleCounts]
  );

  const currentRole = rolesWithCounts.find((role) => role.id === selectedRole);

  const filteredPages = useMemo(
    () =>
      appPages.filter((page) => {
        const matchesSearch = page.name
          .toLowerCase()
          .includes(searchQuery.toLowerCase());
        const matchesCategory =
          categoryFilter === "all" || page.category === categoryFilter;
        return matchesSearch && matchesCategory;
      }),
    [appPages, categoryFilter, searchQuery]
  );

  const groupedPages = useMemo(
    () =>
      filteredPages.reduce((acc, page) => {
        if (!acc[page.category]) {
          acc[page.category] = [];
        }
        acc[page.category].push(page);
        return acc;
      }, {} as Record<string, PermissionPage[]>),
    [filteredPages]
  );

  const togglePermission = (pageId: string, permission: PermissionType) => {
    setRoles((prevRoles) =>
      prevRoles.map((role) => {
        if (role.id !== selectedRole) return role;

        const currentPermissions = role.permissions[pageId] || [];
        const hasPermission = currentPermissions.includes(permission);
        const newPermissions = hasPermission
          ? currentPermissions.filter((entry) => entry !== permission)
          : [...currentPermissions, permission];

        return {
          ...role,
          permissions: {
            ...role.permissions,
            [pageId]: normalizePermissionList(newPermissions),
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
    savePermissionsMutation.mutate(
      {
        roles: serializeRolesForSave(roles, validRoleIds, appPages),
      },
      {
        onSuccess: (response) => {
          const hydratedRoles = normalizeStoredRoles(
            response.roles,
            appPages,
            validRoleIds,
            systemRoleIds
          );
          const nextRoles = hydratedRoles.length > 0 ? hydratedRoles : defaultRoles;
          setRoles(nextRoles);
          if (!nextRoles.some((role) => role.id === selectedRole)) {
            setSelectedRole(nextRoles[0]?.id || "");
          }
        },
      }
    );
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

  const handleAddRole = () => {
    if (!newRoleName.trim()) {
      toast.error("Role name is required");
      return;
    }

    const newRole: UserRole = {
      id: newRoleName.toLowerCase().replace(/\s+/g, "-"),
      name: newRoleName.trim(),
      description: newRoleDescription.trim(),
      usersCount: 0,
      sourceRoles: [],
      system: false,
      permissions: createEmptyPermissionMap(appPages),
    };

    setRoles((prev) => [...prev, newRole]);
    setSelectedRole(newRole.id);
    setNewRoleName("");
    setNewRoleDescription("");
    setIsAddRoleOpen(false);
    toast.success(`Role "${newRole.name}" created`);
  };

  const selectAllForPage = (pageId: string) => {
    setRoles((prevRoles) =>
      prevRoles.map((role) => {
        if (role.id !== selectedRole) return role;
        return {
          ...role,
          permissions: {
            ...role.permissions,
            [pageId]: [...ALL_ACTIONS],
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
                    <Badge
                      variant="secondary"
                      className={
                        selectedRole === role.id
                          ? "bg-primary-foreground/20 text-primary-foreground"
                          : ""
                      }
                    >
                      <Users className="h-3 w-3 mr-1" />
                      {role.usersCount}
                    </Badge>
                  </div>
                  <p
                    className={`text-xs mt-1 ${
                      selectedRole === role.id
                        ? "text-primary-foreground/80"
                        : "text-muted-foreground"
                    }`}
                  >
                    {role.description}
                  </p>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

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
                    {Array.from(new Set(appPages.map((page) => page.category))).map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
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
                            {ALL_ACTIONS.map((action) => (
                              <label key={action} className="flex items-center gap-2 text-sm">
                                <Checkbox
                                  checked={hasPermission(page.id, action)}
                                  onCheckedChange={() => togglePermission(page.id, action)}
                                />
                                {action === "view" && <Eye className="h-4 w-4 text-muted-foreground" />}
                                {action === "create" && <Plus className="h-4 w-4 text-muted-foreground" />}
                                {action === "edit" && <Pencil className="h-4 w-4 text-muted-foreground" />}
                                {action === "delete" && <Trash2 className="h-4 w-4 text-muted-foreground" />}
                                {action.charAt(0).toUpperCase() + action.slice(1)}
                              </label>
                            ))}
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
