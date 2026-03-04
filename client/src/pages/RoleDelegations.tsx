import { useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { useAuth } from "@/contexts/AuthContext";
import { useLocations } from "@/hooks/useLocations";
import { useEmployees } from "@/hooks/useEmployees";
import {
  useCreateRoleDelegation,
  useRevokeRoleDelegation,
  useRoleDelegations,
} from "@/hooks/useRoleDelegations";

const DELEGABLE_ROLES = [
  "office_head",
  "caretaker",
  "employee",
  "storekeeper",
  "inventory_controller",
  "procurement_officer",
  "compliance_auditor",
];

function toRoleLabel(value: string) {
  const normalized = String(value || "").trim().toLowerCase();
  switch (normalized) {
    case "org_admin":
      return "Org Admin";
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
        .split(/[_-\s]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
}

function toDateTimeLocalString(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const tzOffsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - tzOffsetMs).toISOString().slice(0, 16);
}

export default function RoleDelegations() {
  const { isOrgAdmin, locationId } = useAuth();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selectedOfficeId, setSelectedOfficeId] = useState("ALL");
  const [delegateUserId, setDelegateUserId] = useState("");
  const [startsAt, setStartsAt] = useState(toDateTimeLocalString(new Date().toISOString()));
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<string[]>(["employee"]);

  const { data: locations = [] } = useLocations();
  const { data: employees = [] } = useEmployees();

  const effectiveOfficeId = isOrgAdmin
    ? selectedOfficeId !== "ALL"
      ? selectedOfficeId
      : undefined
    : locationId || undefined;

  const { data: delegations = [], isLoading } = useRoleDelegations({
    officeId: effectiveOfficeId,
    includeInactive,
  });
  const createDelegation = useCreateRoleDelegation();
  const revokeDelegation = useRevokeRoleDelegation();

  const selectedOffice = useMemo(
    () => locations.find((location) => location.id === (effectiveOfficeId || locationId || "")) || null,
    [locations, effectiveOfficeId, locationId]
  );
  const officeUserOptions = useMemo(() => {
    const officeId = isOrgAdmin ? selectedOfficeId : locationId || "";
    if (!officeId || officeId === "ALL") return [];
    return employees
      .filter((employee) => String(employee.location_id || "") === officeId && employee.user_id)
      .map((employee) => {
        const name = `${String(employee.first_name || "")} ${String(employee.last_name || "")}`.trim();
        const label = name || String(employee.email || employee.user_id || "Unknown user");
        return {
          value: String(employee.user_id),
          label: `${label} (${employee.email || "no email"})`,
        };
      });
  }, [employees, isOrgAdmin, selectedOfficeId, locationId]);

  const resetCreateForm = () => {
    setDelegateUserId("");
    setStartsAt(toDateTimeLocalString(new Date().toISOString()));
    setEndsAt("");
    setReason("");
    setSelectedRoles(["employee"]);
  };

  const onSubmitCreate = async () => {
    const officeId = isOrgAdmin ? (selectedOfficeId !== "ALL" ? selectedOfficeId : "") : locationId || "";
    if (!delegateUserId || !startsAt || !endsAt || selectedRoles.length === 0 || !officeId) return;
    await createDelegation.mutateAsync({
      delegateUserId,
      officeId: isOrgAdmin ? officeId : undefined,
      delegatedRoles: selectedRoles,
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
      reason: reason.trim() || undefined,
    });
    setIsCreateDialogOpen(false);
    resetCreateForm();
  };

  return (
    <MainLayout title="Role Delegations" description="Create and track acting authority windows">
      <PageHeader
        title="Role Delegations"
        description="Office head and caretaker authority can be delegated for defined dates with audit trail."
        action={{ label: "New Delegation", onClick: () => setIsCreateDialogOpen(true) }}
        extra={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Label htmlFor="include-inactive" className="text-xs">Include inactive</Label>
            <Switch
              id="include-inactive"
              checked={includeInactive}
              onCheckedChange={setIncludeInactive}
            />
          </div>
        }
      />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Delegation Scope</CardTitle>
          <CardDescription>
            {isOrgAdmin ? "Select office to view/create delegations." : "You can manage delegations for your assigned office."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isOrgAdmin ? (
            <SearchableSelect
              value={selectedOfficeId}
              onValueChange={setSelectedOfficeId}
              placeholder="Filter by office"
              searchPlaceholder="Search offices..."
              emptyText="No offices found."
              options={[
                { value: "ALL", label: "All Offices" },
                ...locations.map((location) => ({ value: location.id, label: location.name })),
              ]}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Office: <span className="font-medium text-foreground">{selectedOffice?.name || "Not assigned"}</span>
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Delegation Register</CardTitle>
          <CardDescription>Active and historical delegation entries.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Delegate</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!isLoading && delegations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No delegations found.
                    </TableCell>
                  </TableRow>
                )}
                {delegations.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-medium">{row.delegate_email || row.delegate_user_id}</div>
                      <div className="text-xs text-muted-foreground">Delegator: {row.delegator_email || row.delegator_user_id}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(row.delegated_roles || []).map((role) => (
                          <Badge key={`${row.id}-${role}`} variant="outline">{toRoleLabel(role)}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{new Date(row.starts_at).toLocaleString()}</div>
                      <div className="text-muted-foreground">{new Date(row.ends_at).toLocaleString()}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.status === "ACTIVE" && row.is_currently_active ? "default" : "secondary"}>
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[260px] whitespace-normal text-muted-foreground">
                      {row.reason || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.status === "ACTIVE" ? (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => revokeDelegation.mutate(row.id)}
                          disabled={revokeDelegation.isPending}
                        >
                          Revoke
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">No action</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={isCreateDialogOpen}
        onOpenChange={(open) => {
          setIsCreateDialogOpen(open);
          if (!open) resetCreateForm();
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Create Delegation</DialogTitle>
            <DialogDescription>
              Assign acting authority for defined dates. All actions are audited.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {isOrgAdmin && (
              <div className="space-y-2">
                <Label>Office</Label>
                <SearchableSelect
                  value={selectedOfficeId}
                  onValueChange={setSelectedOfficeId}
                  placeholder="Select office"
                  searchPlaceholder="Search offices..."
                  emptyText="No offices found."
                  options={locations.map((location) => ({ value: location.id, label: location.name }))}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Delegate user</Label>
              <SearchableSelect
                value={delegateUserId}
                onValueChange={setDelegateUserId}
                placeholder="Select user"
                searchPlaceholder="Search users..."
                emptyText="No users with linked accounts found for this office."
                options={officeUserOptions}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Starts at</Label>
                <Input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(event) => setStartsAt(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Ends at</Label>
                <Input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Delegated roles</Label>
              <div className="grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-2">
                {DELEGABLE_ROLES.map((role) => {
                  const checked = selectedRoles.includes(role);
                  return (
                    <label key={role} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setSelectedRoles((prev) => Array.from(new Set([...prev, role])));
                          } else {
                            setSelectedRoles((prev) => prev.filter((entry) => entry !== role));
                          }
                        }}
                      />
                      {toRoleLabel(role)}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Annual leave coverage" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={onSubmitCreate}
              disabled={
                createDelegation.isPending
                || !delegateUserId
                || !startsAt
                || !endsAt
                || selectedRoles.length === 0
                || (isOrgAdmin && (selectedOfficeId === "ALL" || !selectedOfficeId))
              }
            >
              Create Delegation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
