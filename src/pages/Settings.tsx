import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Building2, 
  Bell, 
  Shield, 
  Database,
  Mail,
  Globe,
  Save,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import { useBackupData, useSystemSettings, useTestEmail, useUpdateSystemSettings } from "@/hooks/useSettings";
import { useEffect, useMemo, useState } from "react";
import { SystemSettings } from "@/types";

export default function Settings() {
  const { data, isLoading } = useSystemSettings();
  const updateSettings = useUpdateSystemSettings();
  const backupData = useBackupData();
  const testEmail = useTestEmail();
  const [formState, setFormState] = useState<SystemSettings | null>(null);
  const [isApiDialogOpen, setIsApiDialogOpen] = useState(false);

  useEffect(() => {
    if (data?.settings) {
      setFormState(data.settings);
    }
  }, [data?.settings]);

  const systemInfo = data?.systemInfo;

  const storageLabel = useMemo(() => {
    if (systemInfo?.storage_used_bytes == null || systemInfo.storage_limit_bytes == null) {
      return "Unknown";
    }
    const usedGb = systemInfo.storage_used_bytes / (1024 * 1024 * 1024);
    const limitGb = systemInfo.storage_limit_bytes / (1024 * 1024 * 1024);
    return `${usedGb.toFixed(1)} GB / ${limitGb.toFixed(1)} GB`;
  }, [systemInfo?.storage_limit_bytes, systemInfo?.storage_used_bytes]);

  const handleSave = async () => {
    if (!formState) return;
    try {
      await updateSettings.mutateAsync({
        organization: formState.organization,
        notifications: formState.notifications,
        security: formState.security,
      });
      toast.success("Settings saved successfully");
    } catch (error) {
      toast.error("Failed to save settings");
    }
  };

  const handleBackup = async () => {
    try {
      const result = await backupData.mutateAsync();
      toast.success(result.message || "Backup completed");
    } catch (error) {
      toast.error("Backup failed");
    }
  };

  const handleTestEmail = async () => {
    try {
      const result = await testEmail.mutateAsync();
      toast.success(result.message || "Test email sent");
    } catch (error) {
      toast.error("Test email failed");
    }
  };

  if (isLoading || !formState) {
    return (
      <MainLayout title="Settings" description="Configure system preferences">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Settings" description="Configure system preferences">
      <PageHeader
        title="Settings"
        description="Manage your organization and system preferences"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Settings */}
        <div className="lg:col-span-2 space-y-6">
          {/* Organization */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-lg">Organization</CardTitle>
              </div>
              <CardDescription>
                Configure your organization details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="org-name">Organization Name</Label>
                  <Input
                    id="org-name"
                    value={formState.organization.name}
                    onChange={(event) =>
                      setFormState((prev) =>
                        prev
                          ? { ...prev, organization: { ...prev.organization, name: event.target.value } }
                          : prev
                      )
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-code">Organization Code</Label>
                  <Input
                    id="org-code"
                    value={formState.organization.code}
                    onChange={(event) =>
                      setFormState((prev) =>
                        prev
                          ? { ...prev, organization: { ...prev.organization, code: event.target.value } }
                          : prev
                      )
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={formState.organization.address}
                  onChange={(event) =>
                    setFormState((prev) =>
                      prev
                        ? { ...prev, organization: { ...prev.organization, address: event.target.value } }
                        : prev
                    )
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Contact Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formState.organization.email}
                    onChange={(event) =>
                      setFormState((prev) =>
                        prev
                          ? { ...prev, organization: { ...prev.organization, email: event.target.value } }
                          : prev
                      )
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={formState.organization.phone}
                    onChange={(event) =>
                      setFormState((prev) =>
                        prev
                          ? { ...prev, organization: { ...prev.organization, phone: event.target.value } }
                          : prev
                      )
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notifications */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-lg">Notifications</CardTitle>
              </div>
              <CardDescription>
                Configure notification preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Low Stock Alerts</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified when asset stock is low
                  </p>
                </div>
                <Switch
                  checked={formState.notifications.low_stock_alerts}
                  onCheckedChange={(checked) =>
                    setFormState((prev) =>
                      prev
                        ? { ...prev, notifications: { ...prev.notifications, low_stock_alerts: checked } }
                        : prev
                    )
                  }
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Maintenance Reminders</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive reminders for scheduled maintenance
                  </p>
                </div>
                <Switch
                  checked={formState.notifications.maintenance_reminders}
                  onCheckedChange={(checked) =>
                    setFormState((prev) =>
                      prev
                        ? { ...prev, notifications: { ...prev.notifications, maintenance_reminders: checked } }
                        : prev
                    )
                  }
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Assignment Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified when assets are assigned or returned
                  </p>
                </div>
                <Switch
                  checked={formState.notifications.assignment_notifications}
                  onCheckedChange={(checked) =>
                    setFormState((prev) =>
                      prev
                        ? { ...prev, notifications: { ...prev.notifications, assignment_notifications: checked } }
                        : prev
                    )
                  }
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Warranty Expiry Alerts</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive alerts before warranty expiration
                  </p>
                </div>
                <Switch
                  checked={formState.notifications.warranty_expiry_alerts}
                  onCheckedChange={(checked) =>
                    setFormState((prev) =>
                      prev
                        ? { ...prev, notifications: { ...prev.notifications, warranty_expiry_alerts: checked } }
                        : prev
                    )
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* Security */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-lg">Security</CardTitle>
              </div>
              <CardDescription>
                Security and access control settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Two-Factor Authentication</Label>
                  <p className="text-sm text-muted-foreground">
                    Require 2FA for all users
                  </p>
                </div>
                <Switch
                  checked={formState.security.two_factor_required}
                  onCheckedChange={(checked) =>
                    setFormState((prev) =>
                      prev
                        ? { ...prev, security: { ...prev.security, two_factor_required: checked } }
                        : prev
                    )
                  }
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Session Timeout</Label>
                  <p className="text-sm text-muted-foreground">
                    Auto logout after 30 minutes of inactivity
                  </p>
                </div>
                <Switch
                  checked={formState.security.session_timeout_minutes > 0}
                  onCheckedChange={(checked) =>
                    setFormState((prev) =>
                      prev
                        ? {
                            ...prev,
                            security: {
                              ...prev.security,
                              session_timeout_minutes: checked
                                ? prev.security.session_timeout_minutes || 30
                                : 0,
                            },
                          }
                        : prev
                    )
                  }
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Audit Logging</Label>
                  <p className="text-sm text-muted-foreground">
                    Log all user actions for compliance
                  </p>
                </div>
                <Switch
                  checked={formState.security.audit_logging}
                  onCheckedChange={(checked) =>
                    setFormState((prev) =>
                      prev
                        ? { ...prev, security: { ...prev.security, audit_logging: checked } }
                        : prev
                    )
                  }
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={handleBackup}
                disabled={backupData.isPending}
              >
                <Database className="h-4 w-4" />
                Backup Data
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={handleTestEmail}
                disabled={testEmail.isPending}
              >
                <Mail className="h-4 w-4" />
                Test Email
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => setIsApiDialogOpen(true)}
              >
                <Globe className="h-4 w-4" />
                API Settings
              </Button>
            </CardContent>
          </Card>

          {/* System Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">System Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Version</span>
                <span className="font-medium">{systemInfo?.version || "Unknown"}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Backup</span>
                <span className="font-medium">
                  {systemInfo?.last_backup_at
                    ? new Date(systemInfo.last_backup_at).toLocaleString()
                    : "Never"}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Database</span>
                <span
                  className={`font-medium ${
                    systemInfo?.database_status === "Connected" ? "text-success" : "text-destructive"
                  }`}
                >
                  {systemInfo?.database_status || "Unknown"}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Storage Used</span>
                <span className="font-medium">{storageLabel}</span>
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <Button className="w-full gap-2" onClick={handleSave} disabled={updateSettings.isPending}>
            {updateSettings.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      <Dialog open={isApiDialogOpen} onOpenChange={setIsApiDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API Settings</DialogTitle>
            <DialogDescription>Connection details for this instance.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="space-y-1">
              <Label>API Base URL</Label>
              <Input value={systemInfo?.api_base_url || "Unknown"} readOnly />
            </div>
            <div className="space-y-1">
              <Label>Client API URL</Label>
              <Input value={import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api"} readOnly />
            </div>
            <div className="space-y-1">
              <Label>Database Status</Label>
              <Input value={systemInfo?.database_status || "Unknown"} readOnly />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsApiDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
