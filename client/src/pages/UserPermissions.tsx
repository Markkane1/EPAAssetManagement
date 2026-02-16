import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { userService } from "@/services/userService";
import { normalizeRole } from "@/services/authService";

// Define app pages/modules
const appPages = [
  { id: "dashboard", name: "Dashboard", category: "Main" },
  { id: "assets", name: "Assets", category: "Main" },
  { id: "consumables", name: "Consumables", category: "Main" },
  { id: "consumable-transfers", name: "Consumable Transfers", category: "Main" },
  { id: "asset-items", name: "Asset Items", category: "Main" },
  { id: "assignments", name: "Assignments", category: "Main" },
  { id: "transfers", name: "Transfers", category: "Main" },
  { id: "maintenance", name: "Maintenance", category: "Main" },
  { id: "employees", name: "Employees", category: "Management" },
  { id: "locations", name: "Locations", category: "Management" },
  { id: "categories", name: "Categories", category: "Management" },
  { id: "directorates", name: "Directorates", category: "Management" },
  { id: "vendors", name: "Vendors", category: "Management" },
  { id: "projects", name: "Projects", category: "Management" },
  { id: "schemes", name: "Schemes", category: "Management" },
  { id: "purchase-orders", name: "Purchase Orders", category: "Management" },
  { id: "reports", name: "Reports", category: "System" },
  { id: "audit-logs", name: "Audit Logs", category: "System" },
  { id: "settings", name: "Settings", category: "System" },
  { id: "user-permissions", name: "User Permissions", category: "System" },
];

// Permission types
type PermissionType = "view" | "create" | "edit" | "delete";

interface UserRole {
  id: string;
  name: string;
  description: string;
  permissions: Record<string, PermissionType[]>;
  usersCount: number;
}

// Mock roles data
const initialRoles: UserRole[] = [
  {
    id: "org_admin",
    name: "Super Administrator",
    description: "Full access to all locations and features",
    usersCount: 0,
    permissions: appPages.reduce((acc, page) => {
      acc[page.id] = ["view", "create", "edit", "delete"];
      return acc;
    }, {} as Record<string, PermissionType[]>),
  },
  {
    id: "org_admin",
    name: "Administrator",
    description: "Full access to all locations and features",
    usersCount: 0,
    permissions: appPages.reduce((acc, page) => {
      acc[page.id] = ["view", "create", "edit", "delete"];
      return acc;
    }, {} as Record<string, PermissionType[]>),
  },
  {
    id: "office_head",
    name: "Location Admin",
    description: "Access to assets and consumables for a single location",
    usersCount: 0,
    permissions: {
      dashboard: ["view"],
      assets: [],
      consumables: [],
      "consumable-transfers": [],
      "asset-items": [],
      assignments: [],
      transfers: [],
      maintenance: [],
      employees: [],
      locations: [],
      categories: [],
      directorates: [],
      vendors: [],
      projects: [],
      schemes: [],
      "purchase-orders": [],
      reports: [],
      "audit-logs": [],
      settings: [],
      "user-permissions": [],
    },
  },
  {
    id: "employee",
    name: "Standard User",
    description: "Basic view access with limited modifications",
    usersCount: 0,
    permissions: {
      dashboard: ["view"],
      assets: ["view"],
      consumables: ["view"],
      "consumable-transfers": ["view"],
      "asset-items": ["view"],
      assignments: ["view"],
      transfers: ["view"],
      maintenance: ["view"],
      employees: ["view"],
      locations: ["view"],
      categories: ["view"],
      directorates: ["view"],
      vendors: ["view"],
      projects: ["view"],
      "purchase-orders": ["view"],
      reports: [],
      "audit-logs": [],
      settings: [],
      "user-permissions": [],
    },
  },
  {
    id: "employee",
    name: "Employee",
    description: "View assigned assets and assignment history only",
    usersCount: 0,
    permissions: {
      dashboard: [],
      assets: [],
      consumables: [],
      "consumable-transfers": [],
      "asset-items": [],
      assignments: ["view"],
      transfers: [],
      maintenance: [],
      employees: [],
      locations: [],
      categories: [],
      directorates: [],
      vendors: [],
      projects: [],
      schemes: [],
      "purchase-orders": [],
      reports: [],
      "audit-logs": [],
      settings: [],
      "user-permissions": [],
    },
  },
  {
    id: "office_head",
    name: "Directorate Head",
    description: "View assignments for the entire directorate",
    usersCount: 0,
    permissions: {
      dashboard: [],
      assets: [],
      consumables: [],
      "consumable-transfers": [],
      "asset-items": [],
      assignments: ["view"],
      transfers: [],
      maintenance: [],
      employees: [],
      locations: [],
      categories: [],
      directorates: [],
      vendors: [],
      projects: [],
      schemes: [],
      "purchase-orders": [],
      reports: [],
      "audit-logs": [],
      settings: [],
      "user-permissions": [],
    },
  },
];

export default function UserPermissions() {
  const [roles, setRoles] = useState<UserRole[]>(initialRoles);
  const [selectedRole, setSelectedRole] = useState<string>("org_admin");
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddRoleOpen, setIsAddRoleOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDescription, setNewRoleDescription] = useState("");

  const { data: users = [] } = useQuery({
    queryKey: ["users-management"],
    queryFn: () => userService.getAll(),
  });

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
        usersCount: roleCounts[role.id] || 0,
      })),
    [roles, roleCounts],
  );

  const currentRole = rolesWithCounts.find((r) => r.id === selectedRole);

  const filteredPages = appPages.filter((page) =>
    page.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
    // In production, this would save to the backend
    toast.success("Permissions saved successfully");
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
      permissions: appPages.reduce((acc, page) => {
        acc[page.id] = [];
        return acc;
      }, {} as Record<string, PermissionType[]>),
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
          <Button onClick={handleSavePermissions}>
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Roles List */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
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
                  <div className="flex items-center justify-between">
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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Shield className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle className="text-lg">
                      {currentRole?.name} Permissions
                    </CardTitle>
                    <CardDescription>{currentRole?.description}</CardDescription>
                  </div>
                </div>
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search pages..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
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

              {/* Legend */}
              <div className="mt-4 flex items-center gap-6 text-sm text-muted-foreground">
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
