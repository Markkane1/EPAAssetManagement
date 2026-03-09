import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Bell,
  Building2,
  ClipboardList,
  Database,
  Globe,
  Loader2,
  Mail,
  Plus,
  Save,
  Settings2,
  Shield,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { API_BASE_URL } from "@/lib/api";
import { useBackupData, useSystemSettings, useTestEmail, useUpdateSystemSettings } from "@/hooks/useSettings";
import type {
  AccessPolicyConfig,
  AccessPolicyRule,
  AccessPolicyScope,
  ApprovalMatrixRule,
  ApprovalScope,
  SchedulerConfig,
  SystemSettings,
} from "@/types";
import { NOTIFICATION_AREA_DEFINITIONS, NOTIFICATION_TOGGLE_LABELS } from "@/config/notificationAreas";

const ACCESS_SCOPE_OPTIONS: AccessPolicyScope[] = ["none", "same_office", "self"];
const APPROVAL_SCOPE_OPTIONS: ApprovalScope[] = ["same_office", "org_wide"];

function parseCsv(value: string, transform?: (entry: string) => string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((entry) => String(entry || "").trim())
        .filter(Boolean)
        .map((entry) => (transform ? transform(entry) : entry))
    )
  );
}

function formatCsv(values?: string[]) {
  return Array.isArray(values) ? values.join(", ") : "";
}

function normalizeSettings(input: SystemSettings): SystemSettings {
  return {
    ...input,
    access_policies: {
      rules: input.access_policies?.rules || {},
      lab_scope: {
        lab_only_allowed_office_types: input.access_policies?.lab_scope?.lab_only_allowed_office_types || [],
        lab_only_allowed_user_office_types: input.access_policies?.lab_scope?.lab_only_allowed_user_office_types || [],
        chemical_allowed_office_types: input.access_policies?.lab_scope?.chemical_allowed_office_types || [],
      },
      updated_at: input.access_policies?.updated_at || null,
      updated_by_user_id: input.access_policies?.updated_by_user_id || null,
    },
    approval_matrix: {
      rules: Array.isArray(input.approval_matrix?.rules) ? input.approval_matrix.rules : [],
      updated_at: input.approval_matrix?.updated_at || null,
      updated_by_user_id: input.approval_matrix?.updated_by_user_id || null,
    },
    scheduler: {
      enabled: Boolean(input.scheduler?.enabled),
      maintenance_interval_minutes: Number(input.scheduler?.maintenance_interval_minutes || 15),
      threshold_interval_minutes: Number(input.scheduler?.threshold_interval_minutes || 30),
      startup_delay_seconds: Number(input.scheduler?.startup_delay_seconds || 15),
      updated_at: input.scheduler?.updated_at || null,
      updated_by_user_id: input.scheduler?.updated_by_user_id || null,
    },
  };
}

function newApprovalRule(index: number): ApprovalMatrixRule {
  return {
    id: `custom_rule_${index + 1}`,
    enabled: true,
    transaction_type: "CUSTOM_TRANSACTION",
    min_amount: 0,
    risk_tags: [],
    required_approvals: 1,
    approver_roles: [],
    scope: "same_office",
    disallow_maker: true,
  };
}

export default function Settings() {
  const { data, isLoading } = useSystemSettings();
  const updateSettings = useUpdateSystemSettings();
  const backupData = useBackupData();
  const testEmail = useTestEmail();
  const navigate = useNavigate();
  const [formState, setFormState] = useState<SystemSettings | null>(null);
  const [isApiDialogOpen, setIsApiDialogOpen] = useState(false);

  useEffect(() => {
    if (data?.settings) {
      setFormState(normalizeSettings(data.settings));
    }
  }, [data?.settings]);

  const systemInfo = data?.systemInfo;
  const accessRules = useMemo(
    () => Object.entries(formState?.access_policies?.rules || {}),
    [formState?.access_policies?.rules]
  );
  const storageLabel = useMemo(() => {
    if (systemInfo?.storage_used_bytes == null || systemInfo.storage_limit_bytes == null) return "Unknown";
    const usedGb = systemInfo.storage_used_bytes / (1024 * 1024 * 1024);
    const limitGb = systemInfo.storage_limit_bytes / (1024 * 1024 * 1024);
    return `${usedGb.toFixed(1)} GB / ${limitGb.toFixed(1)} GB`;
  }, [systemInfo?.storage_limit_bytes, systemInfo?.storage_used_bytes]);

  const updateAccessRule = (action: string, patch: Partial<AccessPolicyRule>) => {
    setFormState((prev) =>
      prev
        ? {
            ...prev,
            access_policies: {
              ...prev.access_policies,
              rules: {
                ...prev.access_policies.rules,
                [action]: {
                  ...prev.access_policies.rules[action],
                  ...patch,
                },
              },
            },
          }
        : prev
    );
  };

  const updateLabScope = (field: keyof AccessPolicyConfig["lab_scope"], value: string) => {
    setFormState((prev) =>
      prev
        ? {
            ...prev,
            access_policies: {
              ...prev.access_policies,
              lab_scope: {
                ...prev.access_policies.lab_scope,
                [field]: parseCsv(value, (entry) => entry.toUpperCase()),
              },
            },
          }
        : prev
    );
  };

  const updateApprovalRule = (index: number, patch: Partial<ApprovalMatrixRule>) => {
    setFormState((prev) =>
      prev
        ? {
            ...prev,
            approval_matrix: {
              ...prev.approval_matrix,
              rules: prev.approval_matrix.rules.map((rule, ruleIndex) =>
                ruleIndex === index ? { ...rule, ...patch } : rule
              ),
            },
          }
        : prev
    );
  };

  const addApprovalRule = () => {
    setFormState((prev) =>
      prev
        ? {
            ...prev,
            approval_matrix: {
              ...prev.approval_matrix,
              rules: [...prev.approval_matrix.rules, newApprovalRule(prev.approval_matrix.rules.length)],
            },
          }
        : prev
    );
  };

  const removeApprovalRule = (index: number) => {
    setFormState((prev) =>
      prev
        ? {
            ...prev,
            approval_matrix: {
              ...prev.approval_matrix,
              rules: prev.approval_matrix.rules.filter((_, ruleIndex) => ruleIndex !== index),
            },
          }
        : prev
    );
  };

  const updateScheduler = (patch: Partial<SchedulerConfig>) => {
    setFormState((prev) => (prev ? { ...prev, scheduler: { ...prev.scheduler, ...patch } } : prev));
  };

  const handleSave = async () => {
    if (!formState) return;
    try {
      await updateSettings.mutateAsync({
        organization: formState.organization,
        notifications: formState.notifications,
        security: formState.security,
        access_policies: formState.access_policies,
        approval_matrix: formState.approval_matrix,
        scheduler: formState.scheduler,
      });
      toast.success("Settings saved successfully");
    } catch {
      toast.error("Failed to save settings");
    }
  };

  const handleBackup = async () => {
    try {
      const result = await backupData.mutateAsync();
      toast.success(result.message || "Backup completed");
    } catch {
      toast.error("Backup failed");
    }
  };

  const handleTestEmail = async () => {
    try {
      const result = await testEmail.mutateAsync();
      toast.success(result.message || "Test email sent");
    } catch {
      toast.error("Test email failed");
    }
  };

  if (isLoading || !formState) {
    return (
      <MainLayout title="Settings" description="Configure system preferences">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Settings" description="Configure system preferences">
      <PageHeader title="Settings" description="Manage system preferences, policies, approvals, and scheduler behavior." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Tabs defaultValue="general" className="space-y-4">
            <TabsList className="w-full justify-start overflow-x-auto">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="policies">Access Policies</TabsTrigger>
              <TabsTrigger value="approvals">Approval Matrix</TabsTrigger>
              <TabsTrigger value="scheduler">Scheduler</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg"><Building2 className="h-5 w-5 text-muted-foreground" />Organization</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2"><Label htmlFor="organization-name">Organization Name</Label><Input id="organization-name" value={formState.organization.name} onChange={(event) => setFormState((prev) => prev ? { ...prev, organization: { ...prev.organization, name: event.target.value } } : prev)} /></div>
                  <div className="space-y-2"><Label htmlFor="organization-code">Organization Code</Label><Input id="organization-code" value={formState.organization.code} onChange={(event) => setFormState((prev) => prev ? { ...prev, organization: { ...prev.organization, code: event.target.value } } : prev)} /></div>
                  <div className="space-y-2 md:col-span-2"><Label htmlFor="organization-address">Address</Label><Input id="organization-address" value={formState.organization.address} onChange={(event) => setFormState((prev) => prev ? { ...prev, organization: { ...prev.organization, address: event.target.value } } : prev)} /></div>
                  <div className="space-y-2"><Label htmlFor="organization-email">Contact Email</Label><Input id="organization-email" value={formState.organization.email} onChange={(event) => setFormState((prev) => prev ? { ...prev, organization: { ...prev.organization, email: event.target.value } } : prev)} /></div>
                  <div className="space-y-2"><Label htmlFor="organization-phone">Phone</Label><Input id="organization-phone" value={formState.organization.phone} onChange={(event) => setFormState((prev) => prev ? { ...prev, organization: { ...prev.organization, phone: event.target.value } } : prev)} /></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2 text-lg"><Bell className="h-5 w-5 text-muted-foreground" />Notifications</CardTitle>
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate("/settings/notifications")}>View Details<ArrowRight className="h-4 w-4" /></Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between"><Label>Low Stock Alerts</Label><Switch checked={formState.notifications.low_stock_alerts} onCheckedChange={(checked) => setFormState((prev) => prev ? { ...prev, notifications: { ...prev.notifications, low_stock_alerts: checked } } : prev)} /></div>
                  <Separator />
                  <div className="flex items-center justify-between"><Label>Maintenance Reminders</Label><Switch checked={formState.notifications.maintenance_reminders} onCheckedChange={(checked) => setFormState((prev) => prev ? { ...prev, notifications: { ...prev.notifications, maintenance_reminders: checked } } : prev)} /></div>
                  <Separator />
                  <div className="flex items-center justify-between"><Label>Assignment Notifications</Label><Switch checked={formState.notifications.assignment_notifications} onCheckedChange={(checked) => setFormState((prev) => prev ? { ...prev, notifications: { ...prev.notifications, assignment_notifications: checked } } : prev)} /></div>
                  <Separator />
                  <div className="flex items-center justify-between"><Label>Warranty Expiry Alerts</Label><Switch checked={formState.notifications.warranty_expiry_alerts} onCheckedChange={(checked) => setFormState((prev) => prev ? { ...prev, notifications: { ...prev.notifications, warranty_expiry_alerts: checked } } : prev)} /></div>
                  <Separator />
                  <div className="space-y-2">
                    {NOTIFICATION_AREA_DEFINITIONS.map((area) => (
                      <div key={area.id} className="rounded-md border p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{area.area}</p>
                          <Badge variant={area.status === "Live" ? "default" : "secondary"}>{area.status}</Badge>
                          <Badge variant={formState.notifications[area.toggle] ? "outline" : "secondary"}>{NOTIFICATION_TOGGLE_LABELS[area.toggle]}: {formState.notifications[area.toggle] ? "ON" : "OFF"}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{area.events}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg"><Shield className="h-5 w-5 text-muted-foreground" />Security</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between"><Label>Two-Factor Authentication</Label><Switch checked={formState.security.two_factor_required} onCheckedChange={(checked) => setFormState((prev) => prev ? { ...prev, security: { ...prev.security, two_factor_required: checked } } : prev)} /></div>
                  <Separator />
                  <div className="flex items-center justify-between"><Label>Session Timeout Enabled</Label><Switch checked={formState.security.session_timeout_minutes > 0} onCheckedChange={(checked) => setFormState((prev) => prev ? { ...prev, security: { ...prev.security, session_timeout_minutes: checked ? prev.security.session_timeout_minutes || 30 : 0 } } : prev)} /></div>
                  <Separator />
                  <div className="flex items-center justify-between"><Label>Audit Logging</Label><Switch checked={formState.security.audit_logging} onCheckedChange={(checked) => setFormState((prev) => prev ? { ...prev, security: { ...prev.security, audit_logging: checked } } : prev)} /></div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="policies" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Access Policy Rules</CardTitle>
                  <CardDescription>Configure backend access and scope enforcement.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {accessRules.map(([action, rule]) => (
                    <div key={action} className="rounded-md border p-4 space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{action}</p>
                        <Badge variant="outline">{rule.scope}</Badge>
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-2"><Label>Allowed Roles</Label><Input value={formatCsv(rule.allowed_roles)} onChange={(event) => updateAccessRule(action, { allowed_roles: parseCsv(event.target.value, (entry) => entry.toLowerCase()) })} /></div>
                        <div className="space-y-2"><Label>Denied Roles</Label><Input value={formatCsv(rule.denied_roles)} onChange={(event) => updateAccessRule(action, { denied_roles: parseCsv(event.target.value, (entry) => entry.toLowerCase()) })} /></div>
                        <div className="space-y-2">
                          <Label>Scope</Label>
                          <Select value={rule.scope} onValueChange={(value) => updateAccessRule(action, { scope: value as AccessPolicyScope })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{ACCESS_SCOPE_OPTIONS.map((scope) => <SelectItem key={scope} value={scope}>{scope}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div className="rounded-md border p-3"><div className="flex items-center justify-between gap-3"><Label>Allow Org Admin</Label><Switch checked={rule.allow_org_admin} onCheckedChange={(checked) => updateAccessRule(action, { allow_org_admin: checked })} /></div></div>
                          <div className="rounded-md border p-3"><div className="flex items-center justify-between gap-3"><Label>Require Assigned Office</Label><Switch checked={rule.require_assigned_office} onCheckedChange={(checked) => updateAccessRule(action, { require_assigned_office: checked })} /></div></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Lab Scope Policy</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2"><Label>Lab-Only Allowed Office Types</Label><Input value={formatCsv(formState.access_policies.lab_scope.lab_only_allowed_office_types)} onChange={(event) => updateLabScope("lab_only_allowed_office_types", event.target.value)} /></div>
                  <div className="space-y-2"><Label>Lab-Only Allowed User Office Types</Label><Input value={formatCsv(formState.access_policies.lab_scope.lab_only_allowed_user_office_types)} onChange={(event) => updateLabScope("lab_only_allowed_user_office_types", event.target.value)} /></div>
                  <div className="space-y-2"><Label>Chemical Allowed Office Types</Label><Input value={formatCsv(formState.access_policies.lab_scope.chemical_allowed_office_types)} onChange={(event) => updateLabScope("chemical_allowed_office_types", event.target.value)} /></div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="approvals" className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2 text-lg"><ClipboardList className="h-5 w-5 text-muted-foreground" />Approval Matrix Rules</CardTitle>
                    <Button type="button" variant="outline" size="sm" onClick={addApprovalRule}><Plus className="mr-2 h-4 w-4" />Add Rule</Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {formState.approval_matrix.rules.map((rule, index) => (
                    <div key={`${rule.id}-${index}`} className="rounded-md border p-4 space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <div><p className="font-medium">{rule.id}</p><p className="text-xs text-muted-foreground">{rule.transaction_type}</p></div>
                        <div className="flex items-center gap-2">
                          <Badge variant={rule.enabled ? "default" : "secondary"}>{rule.enabled ? "Enabled" : "Disabled"}</Badge>
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeApprovalRule(index)} disabled={formState.approval_matrix.rules.length <= 1}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-2"><Label>Rule Id</Label><Input value={rule.id} onChange={(event) => updateApprovalRule(index, { id: event.target.value.trim() })} /></div>
                        <div className="space-y-2"><Label>Transaction Type</Label><Input value={rule.transaction_type} onChange={(event) => updateApprovalRule(index, { transaction_type: event.target.value.toUpperCase() })} /></div>
                        <div className="space-y-2"><Label>Min Amount</Label><Input type="number" min={0} value={rule.min_amount} onChange={(event) => updateApprovalRule(index, { min_amount: Number(event.target.value || 0) })} /></div>
                        <div className="space-y-2"><Label>Required Approvals</Label><Input type="number" min={1} max={10} value={rule.required_approvals} onChange={(event) => updateApprovalRule(index, { required_approvals: Math.max(1, Number(event.target.value || 1)) })} /></div>
                        <div className="space-y-2"><Label>Approver Roles</Label><Input value={formatCsv(rule.approver_roles)} onChange={(event) => updateApprovalRule(index, { approver_roles: parseCsv(event.target.value, (entry) => entry.toLowerCase()) })} /></div>
                        <div className="space-y-2"><Label>Risk Tags</Label><Input value={formatCsv(rule.risk_tags)} onChange={(event) => updateApprovalRule(index, { risk_tags: parseCsv(event.target.value, (entry) => entry.toUpperCase()) })} /></div>
                        <div className="space-y-2">
                          <Label>Scope</Label>
                          <Select value={rule.scope} onValueChange={(value) => updateApprovalRule(index, { scope: value as ApprovalScope })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{APPROVAL_SCOPE_OPTIONS.map((scope) => <SelectItem key={scope} value={scope}>{scope}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div className="rounded-md border p-3"><div className="flex items-center justify-between gap-3"><Label>Enabled</Label><Switch checked={rule.enabled} onCheckedChange={(checked) => updateApprovalRule(index, { enabled: checked })} /></div></div>
                          <div className="rounded-md border p-3"><div className="flex items-center justify-between gap-3"><Label>Disallow Maker</Label><Switch checked={rule.disallow_maker} onCheckedChange={(checked) => updateApprovalRule(index, { disallow_maker: checked })} /></div></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="scheduler" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg"><Settings2 className="h-5 w-5 text-muted-foreground" />Background Scheduler</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between rounded-md border p-4"><Label>Scheduler Enabled</Label><Switch checked={formState.scheduler.enabled} onCheckedChange={(checked) => updateScheduler({ enabled: checked })} /></div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="space-y-2"><Label>Maintenance Interval (minutes)</Label><Input type="number" min={1} value={formState.scheduler.maintenance_interval_minutes} onChange={(event) => updateScheduler({ maintenance_interval_minutes: Math.max(1, Number(event.target.value || 1)) })} /></div>
                    <div className="space-y-2"><Label>Threshold Interval (minutes)</Label><Input type="number" min={1} value={formState.scheduler.threshold_interval_minutes} onChange={(event) => updateScheduler({ threshold_interval_minutes: Math.max(1, Number(event.target.value || 1)) })} /></div>
                    <div className="space-y-2"><Label>Startup Delay (seconds)</Label><Input type="number" min={1} value={formState.scheduler.startup_delay_seconds} onChange={(event) => updateScheduler({ startup_delay_seconds: Math.max(1, Number(event.target.value || 1)) })} /></div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-lg">Quick Actions</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" className="w-full justify-start gap-2" onClick={handleBackup} disabled={backupData.isPending}><Database className="h-4 w-4" />Backup Data</Button>
              <Button variant="outline" className="w-full justify-start gap-2" onClick={handleTestEmail} disabled={testEmail.isPending}><Mail className="h-4 w-4" />Test Email</Button>
              <Button variant="outline" className="w-full justify-start gap-2" onClick={() => setIsApiDialogOpen(true)}><Globe className="h-4 w-4" />API Settings</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-lg">System Info</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Version</span><span className="font-medium">{systemInfo?.version || "Unknown"}</span></div>
              <Separator />
              <div className="flex justify-between"><span className="text-muted-foreground">Last Backup</span><span className="font-medium">{systemInfo?.last_backup_at ? new Date(systemInfo.last_backup_at).toLocaleString() : "Never"}</span></div>
              <Separator />
              <div className="flex justify-between"><span className="text-muted-foreground">Database</span><span className={`font-medium ${systemInfo?.database_status === "Connected" ? "text-success" : "text-destructive"}`}>{systemInfo?.database_status || "Unknown"}</span></div>
              <Separator />
              <div className="flex justify-between"><span className="text-muted-foreground">Storage Used</span><span className="font-medium">{storageLabel}</span></div>
            </CardContent>
          </Card>

          <Button className="w-full gap-2" onClick={handleSave} disabled={updateSettings.isPending}>
            {updateSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
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
            <div className="space-y-1"><Label>API Base URL</Label><Input value={systemInfo?.api_base_url || "Unknown"} readOnly /></div>
            <div className="space-y-1"><Label>Client API URL</Label><Input value={API_BASE_URL} readOnly /></div>
            <div className="space-y-1"><Label>Database Status</Label><Input value={systemInfo?.database_status || "Unknown"} readOnly /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsApiDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
