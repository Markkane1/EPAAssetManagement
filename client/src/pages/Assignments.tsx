import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Eye, RotateCcw, Calendar, Loader2, RefreshCw, PackageCheck } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Assignment } from "@/types";
import {
  useAssignments,
  useCreateAssignment,
  usePagedAssignments,
  useRequestReturn,
  useReassignAsset,
} from "@/hooks/useAssignments";
import { useAssetItems } from "@/hooks/useAssetItems";
import { useAssets } from "@/hooks/useAssets";
import { useEmployees } from "@/hooks/useEmployees";
import { AssignmentFormModal } from "@/components/forms/AssignmentFormModal";
import { ReassignmentFormModal } from "@/components/forms/ReassignmentFormModal";
import { ReturnFormModal } from "@/components/forms/ReturnFormModal";
import { useAuth } from "@/contexts/AuthContext";
import { useDashboardMe } from "@/hooks/useDashboard";
import { MetricCard, TimelineList, WorkflowPanel } from "@/components/shared/workflow";

export default function Assignments() {
  const PAGE_SIZE = 100;
  const { role } = useAuth();
  const [page, setPage] = useState(1);
  const createAssignment = useCreateAssignment();
  const requestReturn = useRequestReturn();
  const reassignAsset = useReassignAsset();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isReassignOpen, setIsReassignOpen] = useState(false);
  const [isReturnOpen, setIsReturnOpen] = useState(false);
  const [detailModal, setDetailModal] = useState<{ open: boolean; assignment: any | null }>({
    open: false,
    assignment: null,
  });
  const isLimitedRole = role === "employee" || role === "office_head";
  const needsFullLists = !isLimitedRole && (isModalOpen || isReassignOpen || isReturnOpen);
  const needsEmployeeLookup = role === "office_head" || needsFullLists;
  const { data: assignments, isLoading } = usePagedAssignments({ page, limit: PAGE_SIZE });
  const { data: me, isLoading: isMeLoading } = useDashboardMe({ enabled: isLimitedRole });
  const { data: assetItems } = useAssetItems({ enabled: needsFullLists });
  const { data: assets } = useAssets({ enabled: needsFullLists });
  const { data: employees } = useEmployees({ enabled: needsEmployeeLookup });
  const { data: modalAssignments } = useAssignments({ enabled: needsFullLists });

  const assignmentList = assignments?.items || [];
  const assetItemList = assetItems || [];
  const assetList = assets || [];
  const employeeList = employees || [];
  const fullAssignmentList = modalAssignments || [];
  const totalAssignments = assignments?.total || assignmentList.length;
  const totalPages = Math.max(1, Math.ceil(totalAssignments / PAGE_SIZE));

  const currentEmployeeId = me?.employeeId || null;
  const currentDirectorateId = me?.employee?.directorate_id || null;
  const visibleAssignments = assignmentList.filter((assignment) => {
    if (role === "employee") {
      return currentEmployeeId ? assignment.employee_id === currentEmployeeId : false;
    }
    if (role === "office_head") {
      return currentDirectorateId
        ? employeeList.some(
            (employee) =>
              employee.id === assignment.employee_id && employee.directorate_id === currentDirectorateId
          )
        : false;
    }
    return true;
  });
  const activeAssignments = visibleAssignments.filter((assignment) => assignment.is_active).length;
  const returnedAssignments = visibleAssignments.length - activeAssignments;
  const expectedReturns = visibleAssignments.filter((assignment) => Boolean(assignment.expected_return_date)).length;
  const recentTimeline = visibleAssignments.slice(0, 5).map((assignment) => ({
    id: assignment.id,
    title: `${assignment.assetName || "Asset"} - ${assignment.itemTag || assignment.id}`,
    description: assignment.employeeName || "Unassigned employee",
    meta: assignment.assigned_date ? new Date(assignment.assigned_date).toLocaleDateString() : "Date unavailable",
    badge: assignment.is_active ? "ACTIVE" : "RETURNED",
    icon: assignment.is_active ? PackageCheck : RotateCcw,
  }));

  const columns = [
    {
      key: "itemTag",
      label: "Asset Tag",
      render: (value: string) => (
        <span className="font-mono font-medium text-primary">{value}</span>
      ),
    },
    {
      key: "assetName",
      label: "Asset",
      render: (value: string) => (
        <span className="font-medium">{value}</span>
      ),
    },
    {
      key: "employeeName",
      label: "Assigned To",
      render: (value: string, row: any) => (
        <div>
          <p className="font-medium">{value}</p>
          <p className="text-xs text-muted-foreground">{row.employeeEmail}</p>
        </div>
      ),
    },
    {
      key: "assigned_date",
      label: "Assigned On",
      render: (value: string) => (
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          {new Date(value).toLocaleDateString()}
        </div>
      ),
    },
    {
      key: "expected_return_date",
      label: "Expected Return",
      render: (value: string | undefined) => {
        if (!value) return <span className="text-muted-foreground">—</span>;
        return new Date(value).toLocaleDateString();
      },
    },
    {
      key: "is_active",
      label: "Status",
      render: (value: boolean) => (
        <Badge variant={value ? "default" : "secondary"} className={value ? "bg-success text-success-foreground" : ""}>
          {value ? "Active" : "Returned"}
        </Badge>
      ),
    },
    {
      key: "notes",
      label: "Notes",
      render: (value: string) => (
        <span className="text-sm text-muted-foreground truncate max-w-[150px] block">
          {value || "—"}
        </span>
      ),
    },
  ];

  const handleNewAssignment = () => {
    setIsModalOpen(true);
  };

  const handleSubmit = async (data: any) => {
    await createAssignment.mutateAsync(data);
  };

  const handleReturnAsset = (id: string) => {
    requestReturn.mutate({ id });
  };

  const handleReturnSubmit = async (data: { assignmentId: string }) => {
    await requestReturn.mutateAsync({ id: data.assignmentId });
  };

  const handleReassignSubmit = async (data: { assignmentId: string; newEmployeeId: string; notes?: string }) => {
    await reassignAsset.mutateAsync({
      id: data.assignmentId,
      newEmployeeId: data.newEmployeeId,
      notes: data.notes,
    });
  };

  const actions = (row: Assignment) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setDetailModal({ open: true, assignment: row })}>
          <Eye className="h-4 w-4 mr-2" /> View Details
        </DropdownMenuItem>
        {!isLimitedRole && row.is_active && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleReturnAsset(row.id)}>
              <RotateCcw className="h-4 w-4 mr-2" /> Request Return
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (isLoading || (isLimitedRole && isMeLoading) || (role === "office_head" && needsEmployeeLookup && !employees)) {
    return (
      <MainLayout title="Assignments" description="Track asset assignments to employees">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Assignments" description="Track asset assignments to employees">
      <PageHeader
        title="Assignments"
        description="View and manage asset assignments"
        eyebrow={isLimitedRole ? "Scoped view" : "Operations"}
        meta={
          <>
            <span>{visibleAssignments.length} assignments in view</span>
            <span className="hidden h-1 w-1 rounded-full bg-border sm:inline-block" />
            <span>{isLimitedRole ? "Restricted by your role" : "Full assignment operations"}</span>
          </>
        }
        action={
          isLimitedRole
            ? undefined
            : {
                label: "New Assignment",
                onClick: handleNewAssignment,
              }
        }
        extra={
          isLimitedRole ? undefined : (
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <Button variant="outline" onClick={() => setIsReturnOpen(true)}>
                <PackageCheck className="h-4 w-4 mr-2" />
                Request Return
              </Button>
              <Button variant="outline" onClick={() => setIsReassignOpen(true)}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Reassign Asset
              </Button>
            </div>
          )
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Visible assignments" value={visibleAssignments.length} helper="Based on your role scope" icon={PackageCheck} tone="primary" />
        <MetricCard label="Active" value={activeAssignments} helper="Currently issued items" icon={RefreshCw} tone="success" />
        <MetricCard label="Returned" value={returnedAssignments} helper="Closed assignment records" icon={RotateCcw} />
        <MetricCard label="Expected returns" value={expectedReturns} helper="Records with a target return date" icon={Calendar} tone="warning" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <WorkflowPanel
          title="Assignment worklist"
          description="Search, review, and act on assignment records. Open the row menu for operational actions."
        >
          <DataTable
            columns={columns}
            data={visibleAssignments}
            pagination={false}
            searchPlaceholder="Search assignments..."
            actions={isLimitedRole ? undefined : actions}
            virtualized
            emptyState={{
              title: "No assignments available",
              description: "Assignments will appear here once assets are issued within your scope.",
            }}
          />
          <div className="mt-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <p className="text-sm text-muted-foreground">
              Showing {assignmentList.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1} to{" "}
              {Math.min(page * PAGE_SIZE, totalAssignments)} of {totalAssignments} assignments
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>
                Previous
              </Button>
              <span className="text-sm font-medium">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        </WorkflowPanel>

        <WorkflowPanel
          title="Recent assignment activity"
          description="A compact timeline of the latest assignment records in this page."
        >
          <TimelineList
            items={recentTimeline}
            emptyTitle="No assignment activity yet"
            emptyDescription="Recent assignment updates will appear here once records are available."
          />
        </WorkflowPanel>
      </div>

      {!isLimitedRole && (
        <>
          <AssignmentFormModal
            open={isModalOpen}
            onOpenChange={setIsModalOpen}
            assetItems={assetItemList as any}
            employees={employeeList as any}
            assets={assetList as any}
            onSubmit={handleSubmit}
          />

          <ReassignmentFormModal
            open={isReassignOpen}
            onOpenChange={setIsReassignOpen}
            assignments={fullAssignmentList as any}
            assetItems={assetItemList as any}
            employees={employeeList as any}
            assets={assetList as any}
            onSubmit={handleReassignSubmit}
          />

          <ReturnFormModal
            open={isReturnOpen}
            onOpenChange={setIsReturnOpen}
            assignments={fullAssignmentList as any}
            assetItems={assetItemList as any}
            employees={employeeList as any}
            assets={assetList as any}
            onSubmit={handleReturnSubmit}
          />
        </>
      )}

      {detailModal.assignment && (
        <Dialog
          open={detailModal.open}
          onOpenChange={(open) => setDetailModal({ open, assignment: open ? detailModal.assignment : null })}
        >
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>Assignment Details</DialogTitle>
              <DialogDescription>Review the selected assignment information.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Asset</span>
                <span className="font-medium">{detailModal.assignment.assetName || "N/A"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Tag</span>
                <span className="font-mono">{detailModal.assignment.itemTag || "N/A"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Employee</span>
                <span className="font-medium">{detailModal.assignment.employeeName || "N/A"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Email</span>
                <span>{detailModal.assignment.employeeEmail || "N/A"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Assigned On</span>
                <span>{new Date(detailModal.assignment.assigned_date).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Expected Return</span>
                <span>
                  {detailModal.assignment.expected_return_date
                    ? new Date(detailModal.assignment.expected_return_date).toLocaleDateString()
                    : "N/A"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <span>{detailModal.assignment.is_active ? "Active" : "Returned"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Notes</span>
                <p className="mt-1">{detailModal.assignment.notes || "N/A"}</p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </MainLayout>
  );
}
