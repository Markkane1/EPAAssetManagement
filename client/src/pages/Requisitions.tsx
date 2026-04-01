import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, ClipboardList, Clock3, PackageCheck } from "lucide-react";
import { useLocations } from "@/hooks/useLocations";
import { useAuth } from "@/contexts/AuthContext";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { FilterBar, FilterField, MetricCard, TimelineList, WorkflowPanel } from "@/components/shared/workflow";
import { useRequisitions } from "@/hooks/useRequisitions";
import { isOfficeAdminRole } from "@/services/authService";

function asId<T extends { id?: string; _id?: string }>(row: T): string {
  return String(row.id || row._id || "");
}

type StatusFilterOption = {
  value: string;
  label: string;
};

const SUBMITTED_STATUSES = new Set(["SUBMITTED", "PENDING_VERIFICATION"]);
const APPROVED_STATUSES = new Set(["APPROVED", "VERIFIED_APPROVED", "IN_FULFILLMENT"]);

const EMPLOYEE_STATUS_OPTIONS: StatusFilterOption[] = [
  { value: "ALL", label: "All" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "APPROVED", label: "Approved" },
  { value: "PARTIALLY_FULFILLED", label: "Partially Fulfilled" },
  { value: "FULFILLED", label: "Fulfilled" },
  { value: "REJECTED_INVALID", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
];

const OFFICE_HEAD_STATUS_OPTIONS: StatusFilterOption[] = [
  { value: "ALL", label: "All Submitted" },
  { value: "SUBMITTED", label: "Submitted" },
];

const CARETAKER_APPROVED_QUEUE_OPTIONS: StatusFilterOption[] = [
  { value: "ALL", label: "Pending Fulfillment" },
  { value: "APPROVED", label: "Approved" },
  { value: "PARTIALLY_FULFILLED", label: "Partially Fulfilled" },
  { value: "FULFILLED", label: "Fulfilled" },
];

const CARETAKER_FULFILLED_QUEUE_OPTIONS: StatusFilterOption[] = [
  { value: "ALL", label: "All Fulfilled" },
  { value: "FULFILLED", label: "Fulfilled" },
  { value: "FULFILLED_PENDING_SIGNATURE", label: "Fulfilled Pending Signature" },
];

const DEFAULT_STATUS_OPTIONS: StatusFilterOption[] = [
  { value: "ALL", label: "All" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "APPROVED", label: "Approved" },
  { value: "PARTIALLY_FULFILLED", label: "Partially Fulfilled" },
  { value: "FULFILLED", label: "Fulfilled" },
  { value: "REJECTED_INVALID", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
];

function getBackendStatusForFilter(filterValue: string): string | undefined {
  if (!filterValue || filterValue === "ALL" || filterValue === "APPROVED" || filterValue === "SUBMITTED") {
    return undefined;
  }
  return filterValue;
}

function matchFilterStatus(filterValue: string, status: string): boolean {
  if (filterValue === "ALL") return true;
  if (filterValue === "SUBMITTED") return SUBMITTED_STATUSES.has(status);
  if (filterValue === "APPROVED") return APPROVED_STATUSES.has(status);
  return status === filterValue;
}

export default function Requisitions() {
  const navigate = useNavigate();
  const location = useLocation();
  const { role } = useAuth();
  const { data: locations } = useLocations();
  const canCreateRequisition = role === "employee";
  const isApprovedQueue = location.pathname === "/requisitions/approved";
  const isCaretaker = role === "caretaker";
  const isCaretakerFulfilledQueue = isCaretaker && !isApprovedQueue;
  const queueParam = isApprovedQueue
    ? "approved"
    : isCaretakerFulfilledQueue
      ? "fulfilled"
      : undefined;
  const pageTitle = isApprovedQueue
    ? "Approved Requisitions"
    : isCaretakerFulfilledQueue
      ? "Fulfilled Requisitions"
      : "Requisitions";
  const pageDescription = isApprovedQueue
    ? "Caretaker queue for approved requisitions pending fulfillment."
    : isCaretakerFulfilledQueue
      ? "Master list of fulfilled requisitions with full filtering."
      : "Track requisition requests and status";
  const headerDescription = isApprovedQueue
    ? "Review approved requisitions and complete fulfillment."
    : isCaretakerFulfilledQueue
      ? "Review fulfilled requisitions and open full requisition details."
      : "Filter and review requisition requests.";

  const statusOptions = useMemo(() => {
    if (role === "employee") return EMPLOYEE_STATUS_OPTIONS;
    if (isOfficeAdminRole(role)) return OFFICE_HEAD_STATUS_OPTIONS;
    if (role === "caretaker") {
      return isApprovedQueue ? CARETAKER_APPROVED_QUEUE_OPTIONS : CARETAKER_FULFILLED_QUEUE_OPTIONS;
    }
    return DEFAULT_STATUS_OPTIONS;
  }, [isApprovedQueue, role]);

  const [status, setStatus] = useState<string>("ALL");
  const [fileNumber, setFileNumber] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({
    status: "ALL",
    fileNumber: "",
    fromDate: "",
    toDate: "",
  });

  const query = useRequisitions({
    limit: 200,
    queue: queueParam,
    status: getBackendStatusForFilter(appliedFilters.status),
    fileNumber: appliedFilters.fileNumber || undefined,
    from: appliedFilters.fromDate || undefined,
    to: appliedFilters.toDate || undefined,
  });

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
      .filter((row) => matchFilterStatus(appliedFilters.status, String(row.status || "")))
      .map((row) => {
        const id = asId(row);
        return {
          ...row,
          id,
          office_name: officeNameById.get(String(row.office_id || "")) || String(row.office_id || "N/A"),
          submitted_by: String(row.submitted_by_user_id || "N/A"),
        };
      })
      .filter((row) => row.id);
  }, [appliedFilters.status, officeNameById, query.data?.data]);

  const columns = [
    { key: "file_number", label: "File Number", render: (value: unknown) => <span className="font-medium">{String(value || "N/A")}</span> },
    {
      key: "status",
      label: "Status",
      render: (value: unknown) => <StatusBadge status={String(value || "UNKNOWN")} />,
    },
    {
      key: "created_at",
      label: "Created",
      render: (value: unknown) => {
        if (!value) return "N/A";
        return new Date(String(value)).toLocaleString();
      },
    },
    { key: "office_name", label: "Office" },
    { key: "submitted_by", label: "Submitted By" },
  ];

  const filterError =
    fromDate && toDate && new Date(fromDate).getTime() > new Date(toDate).getTime()
      ? "The start date must be on or before the end date."
      : "";

  const submittedCount = rows.filter((row) => SUBMITTED_STATUSES.has(String(row.status || ""))).length;
  const approvedCount = rows.filter((row) => APPROVED_STATUSES.has(String(row.status || ""))).length;
  const fulfilledCount = rows.filter((row) => String(row.status || "").includes("FULFILLED")).length;
  const recentTimeline = rows.slice(0, 5).map((row) => ({
    id: row.id,
    title: String(row.file_number || row.id),
    description: `${row.office_name} - ${row.submitted_by}`,
    meta: row.created_at ? new Date(String(row.created_at)).toLocaleString() : "Date unavailable",
    badge: String(row.status || "UNKNOWN"),
    icon: APPROVED_STATUSES.has(String(row.status || "")) ? CheckCircle2 : Clock3,
  }));

  if (query.isLoading) {
    return (
      <MainLayout title={pageTitle} description={pageDescription}>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout
      title={pageTitle}
      description={pageDescription}
    >
      <PageHeader
        title={pageTitle}
        description={headerDescription}
        eyebrow={isApprovedQueue ? "Queue" : isCaretakerFulfilledQueue ? "Completed work" : "Workflow"}
        meta={
          <>
            <span>{rows.length} records</span>
            <span className="hidden h-1 w-1 rounded-full bg-border sm:inline-block" />
            <span>{statusOptions.length - 1} status views</span>
          </>
        }
        action={
          canCreateRequisition
            ? { label: "New Requisition", onClick: () => navigate("/requisitions/new") }
            : undefined
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Visible requests" value={rows.length} helper="Based on the active queue and filters" icon={ClipboardList} tone="primary" />
        <MetricCard label="Submitted" value={submittedCount} helper="Awaiting review or verification" icon={Clock3} tone="warning" />
        <MetricCard label="Approved" value={approvedCount} helper="Ready for fulfillment or issue" icon={CheckCircle2} tone="success" />
        <MetricCard label="Fulfilled" value={fulfilledCount} helper="Completed requisitions in this view" icon={PackageCheck} tone="default" />
      </div>

      <FilterBar>
        <div className="grid gap-4 lg:grid-cols-4">
          <FilterField label="Status">
            <Label htmlFor="requisition-status" className="sr-only">Status</Label>
            <select
              id="requisition-status"
              className="flex h-11 w-full rounded-xl border border-input/80 bg-white px-3.5 py-2 text-sm"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              {statusOptions.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="File Number" hint="Match against the requisition file number">
            <Input
              value={fileNumber}
              onChange={(event) => setFileNumber(event.target.value)}
              placeholder="Search file number"
            />
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
            {filterError ? <p className="field-error">{filterError}</p> : <p className="text-muted-foreground">Filters are applied only when you confirm them.</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() =>
                setAppliedFilters({
                  status,
                  fileNumber: fileNumber.trim(),
                  fromDate,
                  toDate,
                })
              }
              disabled={Boolean(filterError)}
            >
              Apply Filters
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setStatus("ALL");
                setFileNumber("");
                setFromDate("");
                setToDate("");
                setAppliedFilters({
                  status: "ALL",
                  fileNumber: "",
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
          title={isApprovedQueue ? "Approved requisition queue" : "Requisition worklist"}
          description="Use the filter bar to narrow the list, then open a record to review or continue the workflow."
        >
          <DataTable
            columns={columns}
            data={rows as Array<{ id: string }>}
            searchable={false}
            emptyState={{
              title: "No requisitions match the current view",
              description: "Adjust the queue, dates, or status filters to see more requests.",
            }}
            onRowClick={(row) =>
              navigate(`/requisitions/${row.id}`, { state: { from: location.pathname } })
            }
          />
        </WorkflowPanel>

        <WorkflowPanel
          title="Recent activity"
          description="The latest requisitions in this queue, ordered by creation time."
        >
          <TimelineList
            items={recentTimeline}
            emptyTitle="No requisitions yet"
            emptyDescription="New requisition activity will appear here once requests enter this queue."
          />
        </WorkflowPanel>
      </div>
    </MainLayout>
  );
}
