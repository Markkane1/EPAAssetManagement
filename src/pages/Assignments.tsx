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
import { Assignment } from "@/types";
import { useAssignments, useCreateAssignment, useReturnAsset, useReassignAsset } from "@/hooks/useAssignments";
import { useAssetItems, useUpdateAssetItem } from "@/hooks/useAssetItems";
import { useAssets } from "@/hooks/useAssets";
import { useEmployees } from "@/hooks/useEmployees";
import { AssignmentFormModal } from "@/components/forms/AssignmentFormModal";
import { ReassignmentFormModal } from "@/components/forms/ReassignmentFormModal";
import { ReturnFormModal } from "@/components/forms/ReturnFormModal";
import { useAuth } from "@/contexts/AuthContext";

export default function Assignments() {
  const { role, user } = useAuth();
  const { data: assignments, isLoading, error } = useAssignments();
  const { data: assetItems } = useAssetItems();
  const { data: assets } = useAssets();
  const { data: employees } = useEmployees();
  const createAssignment = useCreateAssignment();
  const returnAsset = useReturnAsset();
  const reassignAsset = useReassignAsset();
  const updateAssetItem = useUpdateAssetItem();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isReassignOpen, setIsReassignOpen] = useState(false);
  const [isReturnOpen, setIsReturnOpen] = useState(false);

  const assignmentList = assignments || [];
  const assetItemList = assetItems || [];
  const assetList = assets || [];
  const employeeList = employees || [];

  const currentEmployee = user
    ? employeeList.find((employee) => employee.email?.toLowerCase() === user.email.toLowerCase())
    : undefined;

  const directorateEmployeeIds = currentEmployee?.directorate_id
    ? new Set(
        employeeList
          .filter((employee) => employee.directorate_id === currentEmployee.directorate_id)
          .map((employee) => employee.id)
      )
    : new Set<string>();

  const isLimitedRole = role === "employee" || role === "directorate_head";

  const visibleAssignments = assignmentList.filter((assignment) => {
    if (role === "employee") {
      return currentEmployee ? assignment.employee_id === currentEmployee.id : false;
    }
    if (role === "directorate_head") {
      return currentEmployee?.directorate_id
        ? directorateEmployeeIds.has(assignment.employee_id)
        : false;
    }
    return true;
  });

  const enrichedAssignments = visibleAssignments.map((assignment) => {
    const item = assetItemList.find((i) => i.id === assignment.asset_item_id);
    const asset = item ? assetList.find((a) => a.id === item.asset_id) : null;
    const employee = employeeList.find((e) => e.id === assignment.employee_id);
    
    return {
      ...assignment,
      assetName: asset?.name || "N/A",
      itemTag: item?.tag || "N/A",
      employeeName: employee ? `${employee.first_name} ${employee.last_name}` : "N/A",
      employeeEmail: employee?.email || "N/A",
    };
  });

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
    returnAsset.mutate({ id, returnDate: new Date().toISOString() });
  };

  const handleReturnSubmit = async (data: { assignmentId: string; returnDate: string; condition: string; notes?: string }) => {
    // First, return the asset
    await returnAsset.mutateAsync({ 
      id: data.assignmentId, 
      returnDate: data.returnDate,
    });
    
    // Then update the asset item condition
    const assignment = assignmentList.find(a => a.id === data.assignmentId);
    if (assignment) {
      await updateAssetItem.mutateAsync({
        id: assignment.asset_item_id,
        data: {
          itemCondition: data.condition as any,
          itemStatus: "Available",
          assignmentStatus: "Unassigned",
        },
      });
    }
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
        <DropdownMenuItem>
          <Eye className="h-4 w-4 mr-2" /> View Details
        </DropdownMenuItem>
        {!isLimitedRole && row.is_active && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleReturnAsset(row.id)}>
              <RotateCcw className="h-4 w-4 mr-2" /> Quick Return
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (isLoading) {
    return (
      <MainLayout title="Assignments" description="Track asset assignments to employees">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  if (error) {
    console.warn("API unavailable:", error);
  }

  return (
    <MainLayout title="Assignments" description="Track asset assignments to employees">
      <PageHeader
        title="Assignments"
        description="View and manage asset assignments"
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
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsReturnOpen(true)}>
                <PackageCheck className="h-4 w-4 mr-2" />
                Record Return
              </Button>
              <Button variant="outline" onClick={() => setIsReassignOpen(true)}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Reassign Asset
              </Button>
            </div>
          )
        }
      />

      <DataTable
        columns={columns}
        data={enrichedAssignments}
        searchPlaceholder="Search assignments..."
        actions={isLimitedRole ? undefined : actions}
      />

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
            assignments={assignmentList as any}
            assetItems={assetItemList as any}
            employees={employeeList as any}
            assets={assetList as any}
            onSubmit={handleReassignSubmit}
          />

          <ReturnFormModal
            open={isReturnOpen}
            onOpenChange={setIsReturnOpen}
            assignments={assignmentList as any}
            assetItems={assetItemList as any}
            employees={employeeList as any}
            assets={assetList as any}
            onSubmit={handleReturnSubmit}
          />
        </>
      )}
    </MainLayout>
  );
}
