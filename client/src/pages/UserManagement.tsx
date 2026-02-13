import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import { toast } from "sonner";
import { AppRole } from "@/services/authService";
import { userService, UserWithDetails } from "@/services/userService";
import { locationService } from "@/services/locationService";
import { useAuth } from "@/contexts/AuthContext";

interface Location {
  id: string;
  name: string;
}

const roleLabels: Record<AppRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  location_admin: "Location Admin",
  central_store_admin: "Central Store Admin",
  lab_manager: "Lab Manager",
  lab_user: "Lab User",
  auditor: "Auditor",
  user: "User",
  employee: "Employee",
  directorate_head: "Directorate Head",
  viewer: "Viewer",
};

const roleColors: Record<AppRole, string> = {
  super_admin: "bg-yellow-500 text-yellow-950",
  admin: "bg-primary text-primary-foreground",
  location_admin: "bg-sky-500 text-white",
  central_store_admin: "bg-orange-500 text-white",
  lab_manager: "bg-emerald-600 text-white",
  lab_user: "bg-emerald-400 text-white",
  auditor: "bg-slate-500 text-white",
  user: "bg-secondary text-secondary-foreground",
  employee: "bg-emerald-500 text-white",
  directorate_head: "bg-indigo-500 text-white",
  viewer: "bg-muted text-muted-foreground",
};

export default function UserManagement() {
  const queryClient = useQueryClient();
  const { isSuperAdmin } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [editingUser, setEditingUser] = useState<UserWithDetails | null>(null);
  const [selectedRole, setSelectedRole] = useState<AppRole | "">("");
  const [selectedLocation, setSelectedLocation] = useState<string>("");
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
  const [newUserRole, setNewUserRole] = useState<AppRole>("user");
  const [newUserLocation, setNewUserLocation] = useState<string>("none");

  // Fetch all users with their profiles and roles
  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ["users-management", searchQuery],
    queryFn: () => userService.getAll({ limit: 500, search: searchQuery || undefined }),
  });

  // Fetch all locations
  const { data: locations = [] } = useQuery({
    queryKey: ["locations-management"],
    queryFn: () => locationService.getAll() as Promise<Location[]>,
  });

  // Update user role mutation
  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: AppRole }) =>
      userService.updateRole(userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users-management"] });
      toast.success("User role updated successfully");
    },
    onError: (error) => {
      toast.error("Failed to update role: " + error.message);
    },
  });

  // Update user location mutation
  const updateLocationMutation = useMutation({
    mutationFn: ({ userId, locationId }: { userId: string; locationId: string | null }) =>
      userService.updateLocation(userId, locationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users-management"] });
      toast.success("User location updated successfully");
    },
    onError: (error) => {
      toast.error("Failed to update location: " + error.message);
    },
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: (data: { 
      email: string; 
      password: string; 
      firstName?: string; 
      lastName?: string;
      role?: string;
      locationId?: string;
    }) =>
      userService.create({
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role as AppRole,
        locationId: data.locationId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users-management"] });
      toast.success("User created successfully");
      setIsCreateDialogOpen(false);
      resetNewUserForm();
    },
    onError: (error) => {
      toast.error("Failed to create user: " + error.message);
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) => userService.delete(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users-management"] });
      toast.success("User deleted successfully");
      setDeleteUserId(null);
    },
    onError: (error) => {
      toast.error("Failed to delete user: " + error.message);
    },
  });

  // Reset password mutation
  const resetPasswordMutation = useMutation({
    mutationFn: ({ userId, newPassword }: { userId: string; newPassword: string }) =>
      userService.resetPassword(userId, newPassword),
    onSuccess: () => {
      toast.success("Password reset successfully");
      setResetPasswordUser(null);
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (error) => {
      toast.error("Failed to reset password: " + error.message);
    },
  });

  const resetNewUserForm = () => {
    setNewUserEmail("");
    setNewUserPassword("");
    setNewUserFirstName("");
    setNewUserLastName("");
    setNewUserRole("user");
    setNewUserLocation("none");
  };

  const handleCreateUser = async () => {
    if (!newUserEmail || !newUserPassword) {
      toast.error("Email and password are required");
      return;
    }
    
    await createUserMutation.mutateAsync({
      email: newUserEmail,
      password: newUserPassword,
      firstName: newUserFirstName || undefined,
      lastName: newUserLastName || undefined,
      role: newUserRole,
      locationId: newUserLocation === "none" ? undefined : newUserLocation,
    });
  };

  const handleDeleteUser = (userId: string) => {
    setDeleteUserId(userId);
  };

  const confirmDeleteUser = () => {
    if (deleteUserId) {
      deleteUserMutation.mutate(deleteUserId);
    }
  };

  const handleEditUser = (user: UserWithDetails) => {
    setEditingUser(user);
    setSelectedRole(user.role || "");
    setSelectedLocation(user.location_id || "none");
  };

  const handleSaveUser = async () => {
    if (!editingUser) return;

    try {
      if (selectedRole && selectedRole !== editingUser.role) {
        await updateRoleMutation.mutateAsync({ 
          userId: editingUser.user_id, 
          role: selectedRole as AppRole 
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
    } catch (error) {
      // Error handled by mutations
    }
  };

  const visibleUsers = useMemo(
    () => (isSuperAdmin ? users : users.filter((user) => user.role !== "super_admin")),
    [isSuperAdmin, users]
  );

  const filteredUsers = useMemo(() => {
    const searchLower = searchQuery.toLowerCase();
    if (!searchLower) return visibleUsers;
    return visibleUsers.filter((user) => {
      return (
        user.email?.toLowerCase().includes(searchLower) ||
        user.first_name?.toLowerCase().includes(searchLower) ||
        user.last_name?.toLowerCase().includes(searchLower) ||
        user.location_name?.toLowerCase().includes(searchLower)
      );
    });
  }, [visibleUsers, searchQuery]);

  const getRoleBadge = (role: AppRole | null) => {
    if (!role) return <Badge variant="outline">No Role</Badge>;
    return (
      <Badge className={roleColors[role]}>
        {role === "super_admin" && <Crown className="h-3 w-3 mr-1" />}
        {roleLabels[role]}
      </Badge>
    );
  };

  return (
    <MainLayout title="User Management" description="Manage users and permissions">
      <PageHeader
        title="User Management"
        description="Create, edit and manage user accounts"
        action={{
          label: "Add User",
          onClick: () => setIsCreateDialogOpen(true),
        }}
      />

      <Card>
        <CardContent className="pt-6">
          {/* Search */}
          <div className="flex items-center gap-4 mb-6">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>{visibleUsers.length} total users</span>
            </div>
          </div>

          {/* Users Table */}
          {usersLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="rounded-md border">
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
                  {filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No users found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredUsers.map((user) => (
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
                          {user.email || "—"}
                        </TableCell>
                        <TableCell>{getRoleBadge(user.role)}</TableCell>
                        <TableCell>
                          {user.location_name ? (
                            <div className="flex items-center gap-1 text-sm">
                              <MapPin className="h-3 w-3 text-muted-foreground" />
                              {user.location_name}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
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
        </CardContent>
      </Card>

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
                    {isSuperAdmin && (
                      <SelectItem value="super_admin">
                        <div className="flex items-center gap-2">
                          <Crown className="h-4 w-4 text-yellow-500" />
                          Super Admin
                        </div>
                      </SelectItem>
                    )}
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="location_admin">Location Admin</SelectItem>
                    <SelectItem value="central_store_admin">Central Store Admin</SelectItem>
                    <SelectItem value="lab_manager">Lab Manager</SelectItem>
                    <SelectItem value="lab_user">Lab User</SelectItem>
                    <SelectItem value="auditor">Auditor</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="directorate_head">Directorate Head</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {selectedRole === "super_admin" && "Full access to all locations and system settings"}
                {selectedRole === "admin" && "Full access to all locations and system features"}
                {selectedRole === "location_admin" && "Access limited to a single location without delete or quantity edits"}
                {selectedRole === "central_store_admin" && "Manage central store receiving, transfers, and adjustments"}
                {selectedRole === "lab_manager" && "Manage lab transfers, adjustments, and disposal"}
                {selectedRole === "lab_user" && "Consume and view lab inventory"}
                {selectedRole === "auditor" && "Read-only access to reports and ledger"}
                {selectedRole === "user" && "Basic access with limited modifications"}
                {selectedRole === "employee" && "View only assets assigned to the employee and assignment history"}
                {selectedRole === "directorate_head" && "View assets assigned to all employees in the directorate"}
                {selectedRole === "viewer" && "Read-only access"}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Location
              </label>
              <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Location (All Access)</SelectItem>
                  {locations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {selectedRole === "super_admin" 
                  ? "Super admins have access to all locations regardless of assignment"
                  : selectedRole === "admin"
                    ? "Admins have access to all locations. Location assignment is optional."
                    : selectedRole === "location_admin"
                      ? "Location admins must be assigned to a specific location."
                    : "User may be restricted to their assigned location depending on role"}
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  value={newUserFirstName}
                  onChange={(e) => setNewUserFirstName(e.target.value)}
                  placeholder="John"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={newUserLastName}
                  onChange={(e) => setNewUserLastName(e.target.value)}
                  placeholder="Doe"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
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
                onChange={(e) => setNewUserPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Role
              </Label>
              <Select value={newUserRole} onValueChange={(v) => setNewUserRole(v as AppRole)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
              <SelectContent>
                {isSuperAdmin && (
                  <SelectItem value="super_admin">
                    <div className="flex items-center gap-2">
                      <Crown className="h-4 w-4 text-yellow-500" />
                      Super Admin
                    </div>
                  </SelectItem>
                )}
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="location_admin">Location Admin</SelectItem>
                <SelectItem value="central_store_admin">Central Store Admin</SelectItem>
                <SelectItem value="lab_manager">Lab Manager</SelectItem>
                <SelectItem value="lab_user">Lab User</SelectItem>
                <SelectItem value="auditor">Auditor</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="employee">Employee</SelectItem>
                <SelectItem value="directorate_head">Directorate Head</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Location
              </Label>
              <Select value={newUserLocation} onValueChange={setNewUserLocation}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Location (All Access)</SelectItem>
                  {locations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateUser}
              disabled={createUserMutation.isPending || !newUserEmail || !newUserPassword}
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
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 6 characters"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
                if (resetPasswordUser && newPassword === confirmPassword) {
                  resetPasswordMutation.mutate({ 
                    userId: resetPasswordUser.user_id, 
                    newPassword 
                  });
                }
              }}
              disabled={
                resetPasswordMutation.isPending || 
                !newPassword || 
                newPassword.length < 6 || 
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
