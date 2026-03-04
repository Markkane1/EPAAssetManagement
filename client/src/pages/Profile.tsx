import { MainLayout } from "@/components/layout/MainLayout";
import { useAuth } from "@/contexts/AuthContext";
import type { AppRole } from "@/services/authService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Shield, Calendar, LogOut, KeyRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";

export default function Profile() {
  const { user, roles, activeRole, switchActiveRole, logout } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isSwitchingRole, setIsSwitchingRole] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handlePasswordChange = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }

    setIsUpdatingPassword(true);
    try {
      await api.post("/auth/change-password", {
        oldPassword: currentPassword,
        newPassword,
      });
      toast.success("Password updated");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: unknown) {
      if (error instanceof Error) {
        toast.error(error.message || "Failed to update password");
      } else {
        toast.error("Failed to update password");
      }
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  if (!user) {
    return (
      <MainLayout title="Profile" description="User profile">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">User not found</p>
        </div>
      </MainLayout>
    );
  }

  const initials = user.email
    ? user.email.substring(0, 2).toUpperCase()
    : "U";
  const toRoleLabel = (value?: string | null) => {
    const normalized = String(value || "").trim().toLowerCase();
    switch (normalized) {
      case "org_admin":
        return "Administrator";
      case "office_head":
        return "Office Head";
      case "caretaker":
        return "Caretaker";
      case "employee":
        return "Employee";
      case "storekeeper":
        return "Storekeeper";
      case "inventory_controller":
        return "Inventory Controller";
      case "procurement_officer":
        return "Procurement Officer";
      case "compliance_auditor":
        return "Compliance Auditor";
      default:
        return normalized
          ? normalized
              .split(/[_-\s]+/)
              .filter(Boolean)
              .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
              .join(" ")
          : "User";
    }
  };
  const roleLabel = toRoleLabel(activeRole || user.role);
  const availableRoles = (roles && roles.length > 0 ? roles : user.roles || [user.role]).filter(Boolean);

  return (
    <MainLayout title="My Profile" description="View and manage your account">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Profile Header */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-6">
              <Avatar className="h-24 w-24">
                <AvatarFallback className="bg-primary/10 text-primary text-2xl font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-2">
                <h1 className="text-2xl font-bold">{user.email}</h1>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="bg-primary/10 text-primary">
                    <Shield className="mr-1 h-3 w-3" />
                    {roleLabel}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Account Details */}
        <Card>
          <CardHeader>
            <CardTitle>Account Details</CardTitle>
            <CardDescription>Your account information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Email Address</p>
                <p className="font-medium">{user.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <div className="w-full space-y-2">
                <p className="text-sm text-muted-foreground">Active Role</p>
                <p className="font-medium">{roleLabel}</p>
                {availableRoles.length > 1 && (
                  <Select
                    value={String(activeRole || user.role)}
                    onValueChange={async (value) => {
                      if (value === String(activeRole || user.role)) return;
                      setIsSwitchingRole(true);
                      try {
                        await switchActiveRole(value as AppRole);
                        toast.success("Active role switched");
                      } catch (error: any) {
                        toast.error(error?.message || "Failed to switch active role");
                      } finally {
                        setIsSwitchingRole(false);
                      }
                    }}
                    disabled={isSwitchingRole}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select active role" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableRoles.map((entry) => (
                        <SelectItem key={entry} value={String(entry)}>
                          {toRoleLabel(entry)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <div className="flex flex-wrap gap-2">
                  {availableRoles.map((entry) => (
                    <Badge
                      key={`role-${entry}`}
                      variant={String(entry) === String(activeRole || user.role) ? "default" : "outline"}
                    >
                      {toRoleLabel(entry)}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">User ID</p>
                <p className="font-mono text-sm">{user.id}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Change Password</CardTitle>
            <CardDescription>Update your password using your current credentials</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current-password">Current Password</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isUpdatingPassword}>
                <KeyRound className="mr-2 h-4 w-4" />
                {isUpdatingPassword ? "Updating..." : "Update Password"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Account Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={handleLogout} className="w-full">
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
