import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Download,
  Search, 
  Users,
  MapPin,
  Shield,
  Crown,
  Loader2,
  UserCog,
  UserPlus,
  Trash2,
  KeyRound,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { AppRole } from "@/services/authService";
import { UserWithDetails } from "@/services/userService";
import {
  useCreateUser,
  useDeleteUser,
  useResetUserPassword,
  useUpdateUserLocation,
  useUpdateUserRole,
  useUsers,
  useUserRolePermissionsCatalog,
} from "@/hooks/useUsers";
import { useLocations } from "@/hooks/useLocations";
import { usePageSearch } from "@/contexts/PageSearchContext";
import { cn } from "@/lib/utils";
import { exportToCSV } from "@/lib/exportUtils";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { emailSchema, strongPasswordSchema } from "@/lib/securityUtils";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { FilterBar, WorkflowPanel } from "@/components/shared/workflow";

const userNameSchema = z.string().trim().min(1, "This field is required").max(80, "Must be 80 characters or fewer");

const createUserSchema = z.object({
  firstName: userNameSchema,
  lastName: userNameSchema,
  email: emailSchema.transform((value) => value.toLowerCase()),
  password: strongPasswordSchema,
  role: z.string().trim().min(1, "Role is required"),
  locationId: z.string().trim().min(1, "Location is required"),
});

const resetPasswordSchema = z.object({
  newPassword: strongPasswordSchema,
  confirmPassword: z.string().min(1, "Confirm the new password"),
}).superRefine((value, context) => {
  if (value.newPassword !== value.confirmPassword) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["confirmPassword"],
      message: "Passwords do not match",
    });
  }
});

const CORE_ROLE_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "org_admin", label: "Org Admin" },
  { id: "head_office_admin", label: "Head Office Admin" },
  { id: "office_head", label: "Office Head" },
  { id: "caretaker", label: "Caretaker" },
  { id: "employee", label: "Employee" },
  { id: "storekeeper", label: "Storekeeper" },
  { id: "inventory_controller", label: "Inventory Controller" },
  { id: "procurement_officer", label: "Procurement Officer" },
  { id: "compliance_auditor", label: "Compliance Auditor" },
];

const CORE_ROLE_COLORS: Record<string, string> = {
  org_admin: "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]",
  head_office_admin: "bg-[hsl(36_85%_52%)] text-[hsl(24_100%_12%)]",
  office_head: "bg-[hsl(102_43%_50%)] text-white",
  caretaker: "bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]",
  employee: "bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] border border-border",
  storekeeper: "bg-[hsl(98_45%_83%)] text-[hsl(100_98%_18%)]",
  inventory_controller: "bg-[hsl(90_16%_75%)] text-[hsl(90_8%_18%)]",
  procurement_officer: "bg-[hsl(36_85%_52%)] text-[hsl(24_100%_12%)]",
  compliance_auditor: "bg-[hsl(183_29%_32%)] text-white",
};

function toRoleLabel(role?: string | null, roleNameMap?: Map<string, string>) {
  const normalized = String(role || "").trim().toLowerCase();
  if (!normalized) return "No Role";
  if (roleNameMap?.has(normalized)) return String(roleNameMap.get(normalized));
  const core = CORE_ROLE_OPTIONS.find((entry) => entry.id === normalized);
  if (core) return core.label;
  return normalized
    .split(/[_-\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseRoleList(text: string) {
  return Array.from(
    new Set(
      String(text || "")
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

export default function UserManagement() {
  const pageSearch = usePageSearch();
  const searchQuery = pageSearch?.term || "";
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [editingUser, setEditingUser] = useState<UserWithDetails | null>(null);
  const [selectedRole, setSelectedRole] = useState<AppRole | "">("");
  const [selectedExtraRoles, setSelectedExtraRoles] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<UserWithDetails | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  // New user form state
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserFirstName, setNewUserFirstName] = useState("");
  const [newUserLastName, setNewUserLastName] = useState("");
  const [newUserRole, setNewUserRole] = useState<AppRole | "">("");
  const [newUserExtraRoles, setNewUserExtraRoles] = useState("");
  const [newUserLocation, setNewUserLocation] = useState<string>("");
  const [newUserLocationPickerOpen, setNewUserLocationPickerOpen] = useState(false);
  const [createUserError, setCreateUserError] = useState("");
  const [resetPasswordError, setResetPasswordError] = useState("");

  // Fetch all users with their profiles and roles
  const { data: users = [], isLoading: usersLoading } = useUsers({ search: searchQuery || undefined });

  // Fetch all locations
  const { data: locations = [] } = useLocations();

  const { data: rolePermissionsCatalog } = useUserRolePermissionsCatalog();

  const updateRoleMutation = useUpdateUserRole();
  const updateLocationMutation = useUpdateUserLocation();
  const createUserMutation = useCreateUser();
  const deleteUserMutation = useDeleteUser();
  const resetPasswordMutation = useResetUserPassword();

  const resetNewUserForm = () => {
    setNewUserEmail("");
    setNewUserPassword("");
    setNewUserFirstName("");
    setNewUserLastName("");
    setNewUserRole("");
    setNewUserExtraRoles("");
    setNewUserLocation("");
    setNewUserLocationPickerOpen(false);
    setCreateUserError("");
  };

  const handleCreateUser = async () => {
    const validation = createUserSchema.safeParse({
      firstName: newUserFirstName,
      lastName: newUserLastName,
      email: newUserEmail,
      password: newUserPassword,
      role: newUserRole,
      locationId: newUserLocation,
    });
    if (!validation.success) {
      const message = validation.error.issues[0]?.message || "Review the new user details";
      setCreateUserError(message);
      toast.error(message);
      return;
    }

    const extraRoles = parseRoleList(newUserExtraRoles);
    const invalidExtraRole = extraRoles.find((entry) => !roleNameMap.has(entry));
    if (invalidExtraRole) {
      const message = `Unknown additional role: ${invalidExtraRole}`;
      setCreateUserError(message);
      toast.error(message);
      return;
    }

    setCreateUserError("");
    const allRoles = Array.from(new Set([validation.data.role, ...extraRoles])).filter(Boolean) as AppRole[];

    await createUserMutation.mutateAsync({
      email: validation.data.email,
      password: validation.data.password,
      firstName: validation.data.firstName,
      lastName: validation.data.lastName,
      role: validation.data.role as AppRole,
      roles: allRoles,
      activeRole: validation.data.role as AppRole,
      locationId: validation.data.locationId,
    });
    setPage(1);
    setIsCreateDialogOpen(false);
    resetNewUserForm();
  };

  const handleDeleteUser = (userId: string) => {
    setDeleteUserId(userId);
  };

  const confirmDeleteUser = () => {
    if (deleteUserId) {
      deleteUserMutation.mutate(deleteUserId, {
        onSuccess: () => setDeleteUserId(null),
      });
    }
  };

  const handleEditUser = (user: UserWithDetails) => {
    setEditingUser(user);
    setSelectedRole((user.activeRole || user.role || "") as AppRole | "");
    const otherRoles = (user.roles || [])
      .map((entry) => String(entry || "").trim().toLowerCase())
      .filter((entry) => entry && entry !== String(user.activeRole || user.role || "").trim().toLowerCase());
    setSelectedExtraRoles(otherRoles.join(", "));
    setSelectedLocation(user.location_id || "none");
  };

  const handleSaveUser = async () => {
    if (!editingUser) return;

    try {
      if (!selectedRole) {
        toast.error("Role is required");
        return;
      }
      const extraRoles = parseRoleList(selectedExtraRoles);
      const invalidExtraRole = extraRoles.find((entry) => !roleNameMap.has(entry));
      if (invalidExtraRole) {
        toast.error(`Unknown additional role: ${invalidExtraRole}`);
        return;
      }
      const allRoles = Array.from(new Set([selectedRole, ...extraRoles])).filter(Boolean) as AppRole[];
      const requiresOfficeLocation = allRoles.includes("employee");
      if (requiresOfficeLocation && selectedLocation === "none") {
        toast.error("Employee-role users must be assigned to an office");
        return;
      }
      const currentActiveRole = String(editingUser.activeRole || editingUser.role || "").trim().toLowerCase();
      const currentRoles = (editingUser.roles || [editingUser.role || ""])
        .map((entry) => String(entry || "").trim().toLowerCase())
        .filter(Boolean)
        .sort()
        .join(",");
      const nextRoles = [...allRoles].map((entry) => String(entry).trim().toLowerCase()).sort().join(",");
      if (selectedRole && (selectedRole !== currentActiveRole || currentRoles !== nextRoles)) {
        await updateRoleMutation.mutateAsync({ 
          userId: editingUser.user_id, 
          payload: {
            role: selectedRole as AppRole,
            activeRole: selectedRole as AppRole,
            roles: allRoles,
          },
        });
      }

      const newLocationId = selectedLocation === "none" ? null : selectedLocation;
      if (newLocationId !== editingUser.location_id) {
        await updateLocationMutation.mutateAsync({ 
          userId: editingUser.user_id, 
          locationId: newLocationId 
        });
      }

      setEditingUser(null);
    } catch {
      // Error handled by mutations
    }
  };

  const visibleUsers = useMemo(() => {
    const rows = users || [];
    return rows.filter((user) => {
      const normalizedRole = String(user.role || "").trim().toLowerCase();
      const matchesRole = roleFilter === "all" || normalizedRole === roleFilter;
      const locationId = user.location_id || "none";
      const matchesLocation = locationFilter === "all" || locationId === locationFilter;
      return matchesRole && matchesLocation;
    });
  }, [locationFilter, roleFilter, users]);
  const totalUsers = users.length;
  const totalPages = Math.max(1, Math.ceil(visibleUsers.length / pageSize));
  const pagedUsers = useMemo(
    () => visibleUsers.slice((page - 1) * pageSize, page * pageSize),
    [page, pageSize, visibleUsers]
  );

  useEffect(() => {
    setPage(1);
  }, [searchQuery, roleFilter, locationFilter, pageSize]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);
  const selectedNewUserLocation = useMemo(
    () => locations.find((location) => location.id === newUserLocation) || null,
    [locations, newUserLocation]
  );
  const roleNameMap = useMemo(() => {
    const map = new Map<string, string>();
    CORE_ROLE_OPTIONS.forEach((entry) => map.set(entry.id, entry.label));
    (rolePermissionsCatalog?.roles || []).forEach((role) => {
      const roleId = String(role.id || "").trim().toLowerCase();
      const roleName = String(role.name || "").trim();
      if (roleId && roleName) {
        map.set(roleId, roleName);
      }
    });
    return map;
  }, [rolePermissionsCatalog?.roles]);
  const roleOptions = useMemo(() => {
    const map = new Map<string, string>();
    CORE_ROLE_OPTIONS.forEach((entry) => map.set(entry.id, entry.label));
    (rolePermissionsCatalog?.roles || []).forEach((role) => {
      const roleId = String(role.id || "").trim().toLowerCase();
      const roleName = String(role.name || "").trim();
      if (roleId) {
        map.set(roleId, roleName || toRoleLabel(roleId));
      }
    });
    visibleUsers.forEach((user) => {
      const roleId = String(user.role || "").trim().toLowerCase();
      if (roleId && !map.has(roleId)) {
        map.set(roleId, toRoleLabel(roleId, roleNameMap));
      }
    });
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [rolePermissionsCatalog?.roles, roleNameMap, visibleUsers]);
  const assignedLocationCount = useMemo(
    () => new Set(users.map((user) => user.location_id).filter(Boolean)).size,
    [users]
  );

  const getRoleBadge = (role: AppRole | null) => {
    if (!role) return <Badge variant="outline">No Role</Badge>;
    const normalizedRole = String(role).trim().toLowerCase();
    return (
      <Badge className={CORE_ROLE_COLORS[normalizedRole] || "bg-muted text-foreground"}>
        {normalizedRole === "org_admin" && <Crown className="h-3 w-3 mr-1" />}
        {toRoleLabel(normalizedRole, roleNameMap)}
      </Badge>
    );
  };

  const handleExportCSV = () => {
    exportToCSV(
      visibleUsers.map((user) => ({
        name: user.first_name || user.last_name
          ? `${user.first_name || ""} ${user.last_name || ""}`.trim()
          : "No Name",
        email: user.email || "",
        role: toRoleLabel(user.role, roleNameMap),
        location: user.location_name || "No Location",
        joined: new Date(user.created_at).toISOString(),
      })),
      [
        { key: "name", header: "Name" },
        { key: "email", header: "Email" },
        { key: "role", header: "Role" },
        { key: "location", header: "Location" },
        { key: "joined", header: "Joined" },
      ],
      `user-management-${format(new Date(), "yyyy-MM-dd")}`
    );
  };

  return (
    <MainLayout title="User Management" description="Manage users and permissions">
      <PageHeader
        title="User Management"
        description="Create, edit and manage user accounts"
        eyebrow="Access control"
        meta={
          <>
            <span>{totalUsers} users in directory</span>
            <span className="hidden h-1 w-1 rounded-full bg-border sm:inline-block" />
            <span>{roleOptions.length} available roles</span>
          </>
        }
        action={{
          label: "Add User",
          onClick: () => setIsCreateDialogOpen(true),
        }}
        extra={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <Download className="h-4 w-4 mr-2" />
              CSV
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          title="Total Users"
          value={totalUsers}
          subtitle="Directory records across the current search scope"
          icon={Users}
          variant="primary"
        />
        <StatsCard
          title="Visible Users"
          value={visibleUsers.length}
          subtitle="Rows after role and location filters"
          icon={Search}
          variant="info"
        />
        <StatsCard
          title="Role Catalog"
          value={roleOptions.length}
          subtitle="Core and dynamic role options available"
          icon={Shield}
          variant="warning"
        />
        <StatsCard
          title="Assigned Locations"
          value={assignedLocationCount}
          subtitle="Distinct offices currently linked to users"
          icon={MapPin}
          variant="success"
        />
      </div>

      <WorkflowPanel
        title="User Directory"
        description="Search, filter, and manage user accounts using the same workspace layout as the operational pages."
      >
        <FilterBar className="mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative w-full sm:max-w-sm sm:flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => pageSearch?.setTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full sm:w-[190px]">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                {roleOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="w-full sm:w-[230px]">
              <SearchableSelect
                value={locationFilter}
                onValueChange={setLocationFilter}
                placeholder="Filter by location"
                searchPlaceholder="Search locations..."
                emptyText="No locations found."
                options={[
                  { value: "all", label: "All Locations" },
                  { value: "none", label: "No Location" },
                  ...locations.map((location) => ({ value: location.id, label: location.name })),
                ]}
              />
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>{visibleUsers.length} shown ({totalUsers} total users)</span>
            </div>
          </div>
        </FilterBar>

        {usersLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="table-shell">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No users found
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagedUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-sm">
                              {user.first_name?.[0] || user.email?.[0]?.toUpperCase() || "U"}
                            </div>
                            <div>
                              <p className="font-medium">
                                {user.first_name || user.last_name 
                                  ? `${user.first_name || ""} ${user.last_name || ""}`.trim()
                                  : "No Name"}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {user.email || "-"}
                        </TableCell>
                        <TableCell>{getRoleBadge(user.role)}</TableCell>
                        <TableCell>
                          {user.location_name ? (
                            <div className="flex items-center gap-1 text-sm">
                              <MapPin className="h-3 w-3 text-muted-foreground" />
                              {user.location_name}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(user.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditUser(user)}
                              title="Edit user"
                            >
                              <UserCog className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setResetPasswordUser(user)}
                              title="Reset password"
                            >
                              <KeyRound className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDeleteUser(user.user_id)}
                              title="Delete user"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
          </div>
        )}
        {!usersLoading && totalUsers > 0 && (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {pagedUsers.length === 0 ? 0 : (page - 1) * pageSize + 1} to {Math.min(page * pageSize, visibleUsers.length)} of {visibleUsers.length}
            </p>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
              <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
                <SelectTrigger className="w-full sm:w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25 / page</SelectItem>
                  <SelectItem value="50">50 / page</SelectItem>
                  <SelectItem value="100">100 / page</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage((prev) => prev - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                disabled={page >= totalPages}
                onClick={() => setPage((prev) => prev + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </WorkflowPanel>

      {/* Edit User Dialog */}
      <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update role and location assignment for {editingUser?.email}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Role
              </label>
              <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as AppRole)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((roleOption) => (
                    <SelectItem key={roleOption.id} value={roleOption.id}>
                      {roleOption.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={selectedExtraRoles}
                onChange={(event) => setSelectedExtraRoles(event.target.value)}
                placeholder="Additional roles (comma separated)"
              />
              <p className="text-xs text-muted-foreground">
                {selectedRole === "org_admin" && "Global access across all offices."}
                {selectedRole === "head_office_admin" && "Head-office-scoped management access without global system control."}
                {selectedRole === "office_head" && "Office-scoped management access."}
                {selectedRole === "caretaker" && "Office-scoped custody and workflow operations."}
                {selectedRole === "employee" && "Basic office-scoped access."}
                {selectedRole === "storekeeper" && "Central-store stock operations role."}
                {selectedRole === "inventory_controller" && "Office inventory counts and reconciliation role."}
                {selectedRole === "procurement_officer" && "Purchase order lifecycle role."}
                {selectedRole === "compliance_auditor" && "Read-only compliance and audit visibility."}
                {selectedRole &&
                  ![
                    "head_office_admin",
                    "org_admin",
                    "office_head",
                    "caretaker",
                    "employee",
                    "storekeeper",
                    "inventory_controller",
                    "procurement_officer",
                    "compliance_auditor",
                  ].includes(selectedRole) &&
                  "Access is controlled by dynamic role permissions."}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Location
              </label>
              <SearchableSelect
                value={selectedLocation}
                onValueChange={setSelectedLocation}
                placeholder="Select a location"
                searchPlaceholder="Search locations..."
                emptyText="No locations found."
                options={[
                  ...(selectedRole === "employee" ? [] : [{ value: "none", label: "No Location (All Access)" }]),
                  ...locations.map((location) => ({ value: location.id, label: location.name })),
                ]}
              />
              <p className="text-xs text-muted-foreground">
                {selectedRole === "employee"
                  ? "Employees must be assigned to one office."
                  : selectedRole === "org_admin"
                  ? "Org admins are global. Location assignment is optional."
                  : "Non-org-admin roles should be assigned to one office."}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveUser}
              disabled={updateRoleMutation.isPending || updateLocationMutation.isPending}
            >
              {(updateRoleMutation.isPending || updateLocationMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create User Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
        setIsCreateDialogOpen(open);
        if (!open) resetNewUserForm();
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Create New User
            </DialogTitle>
            <DialogDescription>
              Add a new user to the system
            </DialogDescription>
          </DialogHeader>

            <div className="space-y-4 py-4">
            {createUserError && <p className="text-sm text-destructive">{createUserError}</p>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={newUserFirstName}
                  onChange={(e) => {
                    setNewUserFirstName(e.target.value);
                    if (createUserError) setCreateUserError("");
                  }}
                  placeholder="John"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={newUserLastName}
                  onChange={(e) => {
                    setNewUserLastName(e.target.value);
                    if (createUserError) setCreateUserError("");
                  }}
                  placeholder="Doe"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => {
                    setNewUserEmail(e.target.value);
                    if (createUserError) setCreateUserError("");
                  }}
                  placeholder="user@EPAPunjab.gov.pk"
                  required
                />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password *</Label>
                <Input
                  id="password"
                  type="password"
                  value={newUserPassword}
                  onChange={(e) => {
                    setNewUserPassword(e.target.value);
                    if (createUserError) setCreateUserError("");
                  }}
                  placeholder="At least 12 chars with upper, lower, number, symbol"
                  required
                />
              </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Role *
              </Label>
              <Select value={newUserRole} onValueChange={(v) => setNewUserRole(v as AppRole)}>
                <SelectTrigger
                  onClick={() => {
                    if (createUserError) setCreateUserError("");
                  }}
                >
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((roleOption) => (
                    <SelectItem key={roleOption.id} value={roleOption.id}>
                      {roleOption.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={newUserExtraRoles}
                onChange={(event) => {
                  setNewUserExtraRoles(event.target.value);
                  if (createUserError) setCreateUserError("");
                }}
                placeholder="Additional roles (comma separated)"
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Location *
              </Label>
              <Popover open={newUserLocationPickerOpen} onOpenChange={setNewUserLocationPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                  >
                    {selectedNewUserLocation?.name || "Search and select a location"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Type location name..." />
                    <CommandList>
                      <CommandEmpty>No location found.</CommandEmpty>
                      {locations.map((location) => (
                        <CommandItem
                          key={location.id}
                          value={location.name}
                          onSelect={() => {
                            setNewUserLocation(location.id);
                            setNewUserLocationPickerOpen(false);
                            if (createUserError) setCreateUserError("");
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              newUserLocation === location.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {location.name}
                        </CommandItem>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateUser}
              disabled={
                createUserMutation.isPending ||
                !newUserFirstName.trim() ||
                !newUserLastName.trim() ||
                !newUserEmail.trim() ||
                !newUserPassword ||
                !newUserRole ||
                !newUserLocation
              }
            >
              {createUserMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteUserId} onOpenChange={() => setDeleteUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this user? This action cannot be undone. 
              All associated data including role assignments and activity logs will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteUser}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteUserMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetPasswordUser} onOpenChange={(open) => {
        if (!open) {
          setResetPasswordUser(null);
          setNewPassword("");
          setConfirmPassword("");
          setResetPasswordError("");
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Reset Password
            </DialogTitle>
            <DialogDescription>
              Set a new password for {resetPasswordUser?.email}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {resetPasswordError && <p className="text-sm text-destructive">{resetPasswordError}</p>}
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (resetPasswordError) setResetPasswordError("");
                }}
                placeholder="At least 12 chars with upper, lower, number, symbol"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (resetPasswordError) setResetPasswordError("");
                }}
                placeholder="Confirm new password"
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-destructive">Passwords do not match</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setResetPasswordUser(null)}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                const validation = resetPasswordSchema.safeParse({ newPassword, confirmPassword });
                if (!validation.success) {
                  setResetPasswordError(validation.error.issues[0]?.message || "Review the new password");
                  return;
                }
                if (resetPasswordUser) {
                  setResetPasswordError("");
                  resetPasswordMutation.mutate(
                    {
                      userId: resetPasswordUser.user_id,
                      newPassword: validation.data.newPassword,
                    },
                    {
                      onSuccess: () => {
                        setResetPasswordUser(null);
                        setNewPassword("");
                        setConfirmPassword("");
                        setResetPasswordError("");
                      },
                    }
                  );
                }
              }}
              disabled={
                resetPasswordMutation.isPending || 
                !newPassword || 
                newPassword !== confirmPassword
              }
            >
              {resetPasswordMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}

