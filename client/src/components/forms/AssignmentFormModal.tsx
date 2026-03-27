import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Assignment, AssetItem, Employee, Asset } from "@/types";
import { FormDialogActions } from "@/components/forms/FormDialogActions";
import { SearchableComboboxField } from "@/components/forms/SearchableComboboxField";
import {
  useAssetItemOptions,
  useAssetNameMap,
  useEmployeeOptions,
  useEntityById,
} from "@/components/forms/useFormSearchLookups";

const assignmentSchema = z.object({
  assetItemId: z.string().min(1, "Asset item is required"),
  employeeId: z.string().min(1, "Employee is required"),
  assignedDate: z.string().min(1, "Assignment date is required"),
  expectedReturnDate: z.string().optional(),
  notes: z.string().max(500).optional(),
});

type AssignmentFormData = z.infer<typeof assignmentSchema>;

interface AssignmentFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignment?: Assignment | null;
  assetItems: AssetItem[];
  employees: Employee[];
  assets: Asset[];
  selectedAssetItem?: AssetItem | null;
  onSubmit: (data: AssignmentFormData) => Promise<void>;
}

export function AssignmentFormModal({
  open,
  onOpenChange,
  assignment,
  assetItems,
  employees,
  assets,
  selectedAssetItem,
  onSubmit,
}: AssignmentFormModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [employeePickerOpen, setEmployeePickerOpen] = useState(false);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const isEditing = !!assignment;

  const form = useForm<AssignmentFormData>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: {
      assetItemId: "",
      employeeId: "",
      assignedDate: new Date().toISOString().split("T")[0],
      expectedReturnDate: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (assignment) {
      form.reset({
        assetItemId: assignment.asset_item_id,
        employeeId: assignment.employee_id,
        assignedDate: new Date(assignment.assigned_date).toISOString().split("T")[0],
        expectedReturnDate: assignment.expected_return_date
          ? new Date(assignment.expected_return_date).toISOString().split("T")[0]
          : "",
        notes: assignment.notes || "",
      });
    } else {
      form.reset({
        assetItemId: "",
        employeeId: "",
        assignedDate: new Date().toISOString().split("T")[0],
        expectedReturnDate: "",
        notes: "",
      });
    }
  }, [assignment, form]);

  useEffect(() => {
    if (selectedAssetItem) {
      form.setValue("assetItemId", selectedAssetItem.id);
    }
  }, [selectedAssetItem, form]);

  const handleSubmit = async (data: AssignmentFormData) => {
    setIsSubmitting(true);
    try {
      await onSubmit(data);
      form.reset();
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter available asset items (unassigned)
  const availableItems = assetItems.filter(
    (item) =>
      item.assignment_status === "Unassigned" ||
      item.id === assignment?.asset_item_id ||
      item.id === selectedAssetItem?.id
  );

  const assetNameById = useAssetNameMap(assets);
  const assetOptions = useAssetItemOptions(availableItems, assetNameById);
  const employeeOptions = useEmployeeOptions(employees.filter((employee) => employee.is_active));
  const getAssetById = useEntityById(availableItems);
  const getEmployeeById = useEntityById(employees);
  const selectedAsset = getAssetById(form.watch("assetItemId"));
  const selectedEmployee = getEmployeeById(form.watch("employeeId"));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Assignment" : "New Assignment"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update assignment details." : "Assign an asset to an employee."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <SearchableComboboxField
            label="Asset Item *"
            open={assetPickerOpen}
            onOpenChange={setAssetPickerOpen}
            value={
              selectedAsset
                ? `${selectedAsset.tag || selectedAsset.serial_number || "Asset"} - ${assetNameById.get(selectedAsset.asset_id) || "Unknown"}`
                : undefined
            }
            options={assetOptions}
            placeholder="Search asset items..."
            searchPlaceholder="Search by tag, serial, or asset..."
            emptyText="No asset items found."
            onValueChange={(value) => form.setValue("assetItemId", value)}
            error={form.formState.errors.assetItemId?.message}
          />

          <SearchableComboboxField
            label="Employee *"
            open={employeePickerOpen}
            onOpenChange={setEmployeePickerOpen}
            value={
              selectedEmployee
                ? `${selectedEmployee.first_name} ${selectedEmployee.last_name} - ${selectedEmployee.email}`
                : undefined
            }
            options={employeeOptions}
            placeholder="Search employees..."
            searchPlaceholder="Type name or email..."
            emptyText="No employees found."
            onValueChange={(value) => form.setValue("employeeId", value)}
            error={form.formState.errors.employeeId?.message}
          />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="assignedDate">Assignment Date *</Label>
              <Input
                id="assignedDate"
                type="date"
                {...form.register("assignedDate")}
              />
              {form.formState.errors.assignedDate && (
                <p className="text-sm text-destructive">{form.formState.errors.assignedDate.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="expectedReturnDate">Expected Return</Label>
              <Input
                id="expectedReturnDate"
                type="date"
                {...form.register("expectedReturnDate")}
              />
            </div>
          </div>

          {isEditing && assignment && (
            <div className="space-y-2">
              <Label>Assignment Status</Label>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  assignment.returned_date 
                    ? "bg-success/10 text-success" 
                    : assignment.is_active 
                      ? "bg-info/10 text-info" 
                      : "bg-muted text-muted-foreground"
                }`}>
                  {assignment.returned_date ? "Returned" : assignment.is_active ? "Assigned" : "Inactive"}
                </span>
                {assignment.returned_date && (
                  <span className="text-sm text-muted-foreground">
                    on {new Date(assignment.returned_date).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              {...form.register("notes")}
              placeholder="Optional notes about this assignment..."
              rows={2}
            />
          </div>

          <FormDialogActions
            isSubmitting={isSubmitting}
            onCancel={() => onOpenChange(false)}
            submitLabel={isEditing ? "Update" : "Create Assignment"}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}
