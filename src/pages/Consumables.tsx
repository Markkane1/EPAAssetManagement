import { useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, ClipboardList, Pencil, Trash2, History, Loader2 } from "lucide-react";
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
import { ConsumableAsset } from "@/types";
import { useConsumables, useCreateConsumable, useUpdateConsumable, useDeleteConsumable } from "@/hooks/useConsumables";
import { useConsumableAssignments, useCreateConsumableAssignment } from "@/hooks/useConsumableAssignments";
import { useCategories } from "@/hooks/useCategories";
import { useEmployees } from "@/hooks/useEmployees";
import { useLocations } from "@/hooks/useLocations";
import { ConsumableFormModal } from "@/components/forms/ConsumableFormModal";
import { ConsumableAssignModal } from "@/components/forms/ConsumableAssignModal";

export default function Consumables() {
  const { data: consumables, isLoading, error } = useConsumables();
  const { data: assignments } = useConsumableAssignments();
  const { data: categories } = useCategories();
  const { data: employees } = useEmployees();
  const { data: locations } = useLocations();
  const createConsumable = useCreateConsumable();
  const updateConsumable = useUpdateConsumable();
  const deleteConsumable = useDeleteConsumable();
  const createAssignment = useCreateConsumableAssignment();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingConsumable, setEditingConsumable] = useState<ConsumableAsset | null>(null);
  const [assignModal, setAssignModal] = useState<{ open: boolean; item: ConsumableAsset | null }>({
    open: false,
    item: null,
  });
  const [historyModal, setHistoryModal] = useState<{ open: boolean; item: ConsumableAsset | null }>({
    open: false,
    item: null,
  });

  const consumableList = consumables || [];
  const categoryList = categories || [];
  const employeeList = employees || [];
  const locationList = locations || [];
  const assignmentList = assignments || [];

  const enrichedConsumables = consumableList.map((item) => {
    const categoryName = categoryList.find((cat) => cat.id === item.category_id)?.name || "N/A";
    const assigned = (item.total_quantity || 0) - (item.available_quantity || 0);
    return {
      ...item,
      categoryName,
      assigned,
    };
  });

  const columns = [
    {
      key: "name",
      label: "Consumable",
      render: (value: string, row: any) => (
        <div>
          <p className="font-medium">{value}</p>
          <p className="text-xs text-muted-foreground">{row.categoryName}</p>
        </div>
      ),
    },
    {
      key: "unit",
      label: "Unit",
      render: (value: string) => <Badge variant="outline">{value}</Badge>,
    },
    {
      key: "total_quantity",
      label: "Total",
      render: (value: number, row: any) => (
        <span className="font-medium">{value} {row.unit}</span>
      ),
    },
    {
      key: "available_quantity",
      label: "Available",
      render: (value: number, row: any) => (
        <span className="font-medium">{value} {row.unit}</span>
      ),
    },
    {
      key: "assigned",
      label: "Assigned",
      render: (value: number, row: any) => (
        <span className="text-muted-foreground">{value} {row.unit}</span>
      ),
    },
  ];

  const handleAdd = () => {
    setEditingConsumable(null);
    setIsModalOpen(true);
  };

  const handleEdit = (item: ConsumableAsset) => {
    setEditingConsumable(item);
    setIsModalOpen(true);
  };

  const handleSubmit = async (data: any) => {
    if (editingConsumable) {
      await updateConsumable.mutateAsync({ id: editingConsumable.id, data });
    } else {
      await createConsumable.mutateAsync(data);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this consumable?")) {
      deleteConsumable.mutate(id);
    }
  };

  const handleAssign = async (data: any) => {
    if (!assignModal.item) return;
    await createAssignment.mutateAsync({
      consumableId: assignModal.item.id,
      assigneeType: data.assigneeType,
      assigneeId: data.assigneeId,
      receivedByEmployeeId: data.receivedByEmployeeId,
      quantity: data.quantity,
      inputQuantity: data.inputQuantity,
      inputUnit: data.inputUnit,
      assignedDate: data.assignedDate,
      notes: data.notes,
    });
  };

  const actions = (row: ConsumableAsset) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setAssignModal({ open: true, item: row })}>
          <ClipboardList className="h-4 w-4 mr-2" /> Assign
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setHistoryModal({ open: true, item: row })}>
          <History className="h-4 w-4 mr-2" /> Assignment History
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleEdit(row)}>
          <Pencil className="h-4 w-4 mr-2" /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(row.id)}>
          <Trash2 className="h-4 w-4 mr-2" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const assignmentRows = useMemo(() => {
    if (!historyModal.item) return [];
    return assignmentList
      .filter((assignment) => assignment.consumable_id === historyModal.item?.id)
      .map((assignment) => {
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
          : "—";
        return {
          ...assignment,
          assigneeName,
          receivedByName,
        };
      });
  }, [historyModal.item, assignmentList, employeeList, locationList]);

  if (isLoading) {
    return (
      <MainLayout title="Consumables" description="Manage consumable inventory">
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
    <MainLayout title="Consumables" description="Manage consumable inventory">
      <PageHeader
        title="Consumables"
        description="Track consumable stock and assignments"
        action={{ label: "Add Consumable", onClick: handleAdd }}
      />

      <DataTable
        columns={columns}
        data={enrichedConsumables as any}
        searchPlaceholder="Search consumables..."
        actions={actions}
      />

      <ConsumableFormModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        consumable={editingConsumable}
        categories={categoryList}
        onSubmit={handleSubmit}
      />

      <ConsumableAssignModal
        open={assignModal.open}
        onOpenChange={(open) => setAssignModal({ open, item: open ? assignModal.item : null })}
        consumable={assignModal.item}
        employees={employeeList}
        locations={locationList}
        onSubmit={handleAssign}
      />

      {historyModal.item && (
        <Dialog open={historyModal.open} onOpenChange={(open) => setHistoryModal({ open, item: open ? historyModal.item : null })}>
          <DialogContent className="sm:max-w-[720px]">
            <DialogHeader>
              <DialogTitle>Assignment History</DialogTitle>
              <DialogDescription>
                {historyModal.item.name} ({historyModal.item.unit})
              </DialogDescription>
            </DialogHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Assignee</th>
                    <th className="text-left py-2">Type</th>
                    <th className="text-left py-2">Quantity</th>
                    <th className="text-left py-2">Received By</th>
                    <th className="text-left py-2">Date</th>
                    <th className="text-left py-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {assignmentRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-muted-foreground">
                        No assignments recorded.
                      </td>
                    </tr>
                  ) : (
                    assignmentRows.map((row) => (
                      <tr key={row.id} className="border-b">
                        <td className="py-2">{row.assigneeName}</td>
                        <td className="py-2 capitalize">{row.assignee_type}</td>
                        <td className="py-2">
                          {row.input_quantity ?? row.quantity} {row.input_unit || historyModal.item?.unit}
                        </td>
                        <td className="py-2">{row.receivedByName}</td>
                        <td className="py-2">{new Date(row.assigned_date).toLocaleDateString()}</td>
                        <td className="py-2 text-muted-foreground">{row.notes || "N/A"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </MainLayout>
  );
}
