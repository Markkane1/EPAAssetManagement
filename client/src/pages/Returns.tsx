import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, RotateCcw, CheckCircle2, Clock3, UserRound } from "lucide-react";
import { useEmployees } from "@/hooks/useEmployees";
import { useLocations } from "@/hooks/useLocations";
import { useAuth } from "@/contexts/AuthContext";
import { ReturnRequestStatus } from "@/types";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { FilterBar, FilterField, MetricCard, TimelineList, WorkflowPanel } from "@/components/shared/workflow";
import { useReturnRequests } from "@/hooks/useReturnRequests";

const STATUS_OPTIONS = [
  "ALL",
  ReturnRequestStatus.Submitted,
  ReturnRequestStatus.ReceivedConfirmed,
  ReturnRequestStatus.ClosedPendingSignature,
  ReturnRequestStatus.Closed,
  ReturnRequestStatus.Rejected,
] as const;

const STATUS_RANK: Record<string, number> = {
  [ReturnRequestStatus.Submitted]: 0,
  [ReturnRequestStatus.ReceivedConfirmed]: 1,
  [ReturnRequestStatus.ClosedPendingSignature]: 2,
  [ReturnRequestStatus.Closed]: 3,
  [ReturnRequestStatus.Rejected]: 4,
};

function asId<T extends { id?: string; _id?: string }>(row: T): string {
  return String(row.id || row._id || "");
}

export default function Returns() {
  const navigate = useNavigate();
  const { role, user } = useAuth();
  const { data: employees } = useEmployees();
  const { data: locations } = useLocations();
  const isEmployeeRole = role === "employee";

  const [status, setStatus] = useState<string>("ALL");
  const [employeeId, setEmployeeId] = useState<string>("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({
    status: "ALL",
    employeeId: "ALL",
    fromDate: "",
    toDate: "",
  });

  const currentEmployee = useMemo(() => {
    const list = employees || [];
    const byUserId = list.find((employee) => employee.user_id === user?.id);
    const byEmail = list.find(
      (employee) => employee.email?.toLowerCase() === (user?.email || "").toLowerCase()
    );
    return byUserId || byEmail || null;
  }, [employees, user?.id, user?.email]);

  const query = useReturnRequests(
    {
      limit: 200,
      status: appliedFilters.status !== "ALL" ? appliedFilters.status : undefined,
      employeeId: isEmployeeRole
        ? currentEmployee?.id || undefined
        : appliedFilters.employeeId !== "ALL"
          ? appliedFilters.employeeId
          : undefined,
      from: appliedFilters.fromDate || undefined,
      to: appliedFilters.toDate || undefined,
    },
    { enabled: !isEmployeeRole || Boolean(currentEmployee?.id) }
  );

  const employeeNameById = useMemo(() => {
    const map = new Map<string, string>();
    (employees || []).forEach((employee) => {
      map.set(employee.id, `${employee.first_name} ${employee.last_name}`.trim() || employee.email);
    });
    return map;
  }, [employees]);

  const officeNameById = useMemo(() => {
    const map = new Map<string, string>();
    (locations || []).forEach((office) => {
      map.set(office.id, office.name);
    });
    return map;
  }, [locations]);

  const rows = useMemo(() => {
    const data = query.data?.data || [];
    return data
      .map((row) => {
        const id = asId(row);
        const createdAt = new Date(String(row.created_at || 0)).getTime() || 0;
        return {
          ...row,
          id,
          _createdAt: createdAt,
          employee_name:
            employeeNameById.get(String(row.employee_id || "")) || String(row.employee_id || "N/A"),
          office_name:
            officeNameById.get(String(row.office_id || "")) || String(row.office_id || "N/A"),
          line_count: Array.isArray(row.lines) ? row.lines.length : 0,
        };
      })
      .filter((row) => row.id)
      .sort((a, b) => {
        const rankA = STATUS_RANK[String(a.status || "")] ?? 99;
        const rankB = STATUS_RANK[String(b.status || "")] ?? 99;
        if (rankA !== rankB) return rankA - rankB;
        return b._createdAt - a._createdAt;
      });
  }, [query.data?.data, employeeNameById, officeNameById]);

  const columns = [
    { key: "id", label: "Request ID", render: (value: unknown) => <span className="font-mono text-xs">{String(value || "N/A")}</span> },
    {
      key: "status",
      label: "Status",
      render: (value: unknown) => <StatusBadge status={String(value || "UNKNOWN")} />,
    },
    { key: "employee_name", label: "Employee" },
    { key: "office_name", label: "Office" },
    { key: "line_count", label: "Lines" },
    {
      key: "created_at",
      label: "Created",
      render: (value: unknown) => (value ? new Date(String(value)).toLocaleString() : "N/A"),
    },
  ];

  const filterError =
    fromDate && toDate && new Date(fromDate).getTime() > new Date(toDate).getTime()
      ? "The start date must be on or before the end date."
      : "";
  const submittedCount = rows.filter((row) => String(row.status) === ReturnRequestStatus.Submitted).length;
  const closedCount = rows.filter((row) => String(row.status) === ReturnRequestStatus.Closed).length;
  const pendingSignatureCount = rows.filter((row) => String(row.status) === ReturnRequestStatus.ClosedPendingSignature).length;
  const recentTimeline = rows.slice(0, 5).map((row) => ({
    id: row.id,
    title: String(row.id),
    description: `${row.employee_name} - ${row.office_name}`,
    meta: row.created_at ? new Date(String(row.created_at)).toLocaleString() : "Date unavailable",
    badge: String(row.status || "UNKNOWN"),
    icon: String(row.status) === ReturnRequestStatus.Closed ? CheckCircle2 : Clock3,
  }));

  if (query.isLoading) {
    return (
      <MainLayout title="Return Requests" description="Review return requests pending confirmation">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Return Requests" description="Review return requests pending confirmation">
      <PageHeader
        title="Return Requests"
        description="Filter and review employee return requests."
        eyebrow={isEmployeeRole ? "Self service" : "Queue"}
        meta={
          <>
            <span>{rows.length} requests</span>
            <span className="hidden h-1 w-1 rounded-full bg-border sm:inline-block" />
            <span>{isEmployeeRole ? "Employee view" : "Operations view"}</span>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Visible requests" value={rows.length} helper="Records in the current filter set" icon={RotateCcw} tone="primary" />
        <MetricCard label="Submitted" value={submittedCount} helper="Awaiting confirmation" icon={Clock3} tone="warning" />
        <MetricCard label="Closed" value={closedCount} helper="Fully completed requests" icon={CheckCircle2} tone="success" />
        <MetricCard
          label={isEmployeeRole ? "Your profile" : "Employees in view"}
          value={isEmployeeRole ? 1 : new Set(rows.map((row) => row.employee_id)).size}
          helper={isEmployeeRole ? "Restricted to your requests" : "Distinct employees in the result set"}
          icon={UserRound}
        />
      </div>

      <FilterBar>
        <div className="grid gap-4 lg:grid-cols-4">
          <FilterField label="Status">
            <Label htmlFor="returns-status" className="sr-only">Status</Label>
            <select
              id="returns-status"
              className="flex h-11 w-full rounded-xl border border-input/80 bg-background/90 px-3.5 py-2 text-sm"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              {STATUS_OPTIONS.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Employee">
            {isEmployeeRole ? (
              <Input
                value={
                  currentEmployee
                    ? `${currentEmployee.first_name} ${currentEmployee.last_name}`.trim() || currentEmployee.email
                    : "Employee mapping missing"
                }
                readOnly
              />
            ) : (
              <>
                <Label htmlFor="returns-employee" className="sr-only">Employee</Label>
                <select
                  id="returns-employee"
                  className="flex h-11 w-full rounded-xl border border-input/80 bg-background/90 px-3.5 py-2 text-sm"
                  value={employeeId}
                  onChange={(event) => setEmployeeId(event.target.value)}
                >
                  <option value="ALL">All employees</option>
                  {(employees || []).map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {`${employee.first_name} ${employee.last_name}`.trim() || employee.email}
                    </option>
                  ))}
                </select>
              </>
            )}
          </FilterField>

          <FilterField label="From Date">
            <Input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              aria-invalid={Boolean(filterError)}
            />
          </FilterField>

          <FilterField label="To Date">
            <Input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              aria-invalid={Boolean(filterError)}
            />
          </FilterField>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-h-5 text-sm">
            {filterError ? (
              <p className="field-error">{filterError}</p>
            ) : (
              <p className="text-muted-foreground">
                {pendingSignatureCount} requests are currently waiting on final signature.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() =>
                setAppliedFilters({
                  status,
                  employeeId: isEmployeeRole ? currentEmployee?.id || "ALL" : employeeId,
                  fromDate,
                  toDate,
                })
              }
              disabled={(isEmployeeRole && !currentEmployee) || Boolean(filterError)}
            >
              Apply Filters
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setStatus("ALL");
                setEmployeeId(isEmployeeRole ? currentEmployee?.id || "ALL" : "ALL");
                setFromDate("");
                setToDate("");
                setAppliedFilters({
                  status: "ALL",
                  employeeId: isEmployeeRole ? currentEmployee?.id || "ALL" : "ALL",
                  fromDate: "",
                  toDate: "",
                });
              }}
            >
              Reset
            </Button>
          </div>
        </div>
      </FilterBar>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <WorkflowPanel
          title="Return request worklist"
          description="Open any request to review its lines, confirm receipt, or continue closure steps."
        >
          <DataTable
            columns={columns}
            data={rows as Array<{ id: string }>}
            searchable={false}
            emptyState={{
              title: "No return requests match the current filters",
              description: "Adjust the status, employee, or date range to broaden the result set.",
            }}
            onRowClick={(row) => navigate(`/returns/${row.id}`)}
          />
        </WorkflowPanel>

        <WorkflowPanel
          title="Recent queue activity"
          description="The most recent return requests in the current view."
        >
          <TimelineList
            items={recentTimeline}
            emptyTitle="No requests yet"
            emptyDescription="Recent return activity will appear here once requests are created."
          />
        </WorkflowPanel>
      </div>
    </MainLayout>
  );
}
