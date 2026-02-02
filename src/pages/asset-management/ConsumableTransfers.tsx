import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Loader2, Flame } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConsumableAssignments } from "@/hooks/useConsumableAssignments";
import { useConsumables } from "@/hooks/useConsumables";
import { useEmployees } from "@/hooks/useEmployees";
import { useLocations } from "@/hooks/useLocations";
import { useAuth } from "@/contexts/AuthContext";
import { consumableConsumptionService } from "@/services/consumableConsumptionService";
import { toast } from "sonner";

export default function ConsumableTransfers() {
  const { role, locationId } = useAuth();
  const queryClient = useQueryClient();
  const { data: assignments, isLoading, error } = useConsumableAssignments();
  const { data: consumables } = useConsumables();
  const { data: employees } = useEmployees();
  const { data: locations } = useLocations();

  const assignmentList = assignments || [];
  const consumableList = consumables || [];
  const employeeList = employees || [];
  const locationList = locations || [];

  const scopedAssignments = useMemo(() => {
    if (role !== "location_admin") return assignmentList;
    if (!locationId) return [];

    return assignmentList.filter((assignment) => {
      if (assignment.assignee_type === "location") {
        return assignment.assignee_id === locationId;
      }
      const employee = employeeList.find((emp) => emp.id === assignment.assignee_id);
      return employee?.location_id === locationId;
    });
  }, [assignmentList, role, locationId, employeeList]);

  const enrichedAssignments = scopedAssignments.map((assignment) => {
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
      : assignment.assignee_type === "location" ? "Unknown" : "N/A";

    return {
      ...assignment,
      consumableName: consumable?.name || "Unknown",
      consumableUnit: consumable?.unit || "",
      availableQuantity: consumable?.available_quantity ?? 0,
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
    { key: "availableQuantity", label: "Available" },
    {
      key: "receivedByName",
      label: "Received By",
      render: (value: string, row: any) => (
        <span className="text-sm text-muted-foreground">
          {row.assignee_type === "location" ? value : "N/A"}
        </span>
      ),
    },
    {
      key: "assigned_date",
      label: "Assigned Date",
      render: (value: string) => new Date(value).toLocaleDateString(),
    },
  ];

  const canConsume = role === "admin" || role === "super_admin";

  const handleConsume = async (row: any) => {
    try {
      const assigneeLocation =
        row.assignee_type === "location"
          ? row.assignee_id
          : employeeList.find((emp) => emp.id === row.assignee_id)?.location_id || null;

      if (!assigneeLocation) {
        toast.error("No location found for this transfer");
        return;
      }

      await consumableConsumptionService.consume({
        consumableId: row.consumable_id,
        locationId: assigneeLocation,
      });
      queryClient.invalidateQueries({ queryKey: ["consumables"] });
      queryClient.invalidateQueries({ queryKey: ["consumable-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["consumable-consumptions"] });
      toast.success("Consumable marked as consumed");
    } catch (error: any) {
      toast.error(error?.message || "Failed to consume");
    }
  };

  const actions = (row: any) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canConsume && (
          <DropdownMenuItem onClick={() => handleConsume(row)}>
            <Flame className="h-4 w-4 mr-2" /> Mark Consumed
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (isLoading) {
    return (
      <MainLayout title="Consumable Transfers" description="Location-based consumable transfers">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  if (error) console.warn("API unavailable:", error);

  return (
    <MainLayout title="Consumable Transfers" description="Transfers scoped to assigned locations">
      <PageHeader
        title="Consumable Transfers"
        description="Transfers for consumables assigned to locations"
      />
      <DataTable
        columns={columns}
        data={enrichedAssignments as any}
        searchPlaceholder="Search transfers..."
        actions={canConsume ? actions : undefined}
      />
    </MainLayout>
  );
}
