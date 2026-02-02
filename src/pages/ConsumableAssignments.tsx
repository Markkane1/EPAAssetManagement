import { useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Trash2, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConsumableAssignments, useDeleteConsumableAssignment } from "@/hooks/useConsumableAssignments";
import { useConsumables } from "@/hooks/useConsumables";
import { useEmployees } from "@/hooks/useEmployees";
import { useLocations } from "@/hooks/useLocations";
import { useAuth } from "@/contexts/AuthContext";

export default function ConsumableAssignments() {
  const { role, user } = useAuth();
  const { data: assignments, isLoading, error } = useConsumableAssignments();
  const { data: consumables } = useConsumables();
  const { data: employees } = useEmployees();
  const { data: locations } = useLocations();
  const deleteAssignment = useDeleteConsumableAssignment();

  const assignmentList = assignments || [];
  const consumableList = consumables || [];
  const employeeList = employees || [];
  const locationList = locations || [];

  const currentEmployee = user
    ? employeeList.find((employee) => employee.email?.toLowerCase() === user.email.toLowerCase())
    : undefined;

  const filteredAssignments = useMemo(() => {
    if (role === "directorate_head") {
      if (!currentEmployee?.directorate_id) return [];
      return assignmentList.filter((assignment) => {
        if (assignment.assignee_type !== "employee") return false;
        const employee = employeeList.find((emp) => emp.id === assignment.assignee_id);
        return employee?.directorate_id === currentEmployee.directorate_id;
      });
    }

    return assignmentList;
  }, [assignmentList, role, employeeList, currentEmployee]);

  const enrichedAssignments = filteredAssignments.map((assignment) => {
    const consumable = consumableList.find((item) => item.id === assignment.consumable_id);
    const assigneeName =
      assignment.assignee_type === "employee"
        ? employeeList.find((emp) => emp.id === assignment.assignee_id)
          ? `${employeeList.find((emp) => emp.id === assignment.assignee_id)?.first_name} ${employeeList.find((emp) => emp.id === assignment.assignee_id)?.last_name}`
          : "Unknown"
        : locationList.find((loc) => loc.id === assignment.assignee_id)?.name || "Unknown";
    const receivedByName = assignment.received_by_employee_id
      ? employeeList.find((emp) => emp.id === assignment.received_by_employee_id)
        ? `${employeeList.find((emp) => emp.id === assignment.received_by_employee_id)?.first_name} ${employeeList.find((emp) => emp.id === assignment.received_by_employee_id)?.last_name}`
        : "Unknown"
      : assignment.assignee_type === "location" ? "Unknown" : "—";

    return {
      ...assignment,
      consumableName: consumable?.name || "Unknown",
      consumableUnit: consumable?.unit || "",
      assigneeName,
      receivedByName,
      displayQuantity: assignment.input_quantity ?? assignment.quantity,
      displayUnit: assignment.input_unit || consumable?.unit || "",
    };
  });

  const columns = [
    { key: "consumableName", label: "Consumable" },
    {
      key: "assigneeName",
      label: "Assigned To",
      render: (value: string, row: any) => (
        <div>
          <p className="font-medium">{value}</p>
          <p className="text-xs text-muted-foreground capitalize">{row.assignee_type}</p>
        </div>
      ),
    },
    {
      key: "displayQuantity",
      label: "Quantity",
      render: (value: number, row: any) => (
        <span className="font-medium">{value} {row.displayUnit}</span>
      ),
    },
    {
      key: "receivedByName",
      label: "Received By",
      render: (value: string, row: any) => (
        <span className="text-sm text-muted-foreground">
          {row.assignee_type === "location" ? value : "—"}
        </span>
      ),
    },
    {
      key: "assigned_date",
      label: "Assigned Date",
      render: (value: string) => new Date(value).toLocaleDateString(),
    },
    {
      key: "notes",
      label: "Notes",
      render: (value: string) => (
        <span className="text-sm text-muted-foreground truncate max-w-[200px] block">
          {value || "N/A"}
        </span>
      ),
    },
  ];

  const canModify = role !== "employee" && role !== "directorate_head";

  const actions = (row: any) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          className="text-destructive"
          onClick={() => {
            if (confirm("Remove this assignment and restore stock?")) {
              deleteAssignment.mutate(row.id);
            }
          }}
        >
          <Trash2 className="h-4 w-4 mr-2" /> Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (isLoading) {
    return (
      <MainLayout title="Consumable Transfers" description="Track consumable transfers">
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
    <MainLayout title="Consumable Transfers" description="Track consumable transfers">
      <PageHeader
        title="Consumable Transfers"
        description="View consumable transfer records"
      />
      <DataTable
        columns={columns}
        data={enrichedAssignments as any}
        searchPlaceholder="Search assignments..."
        actions={canModify ? actions : undefined}
      />
    </MainLayout>
  );
}
