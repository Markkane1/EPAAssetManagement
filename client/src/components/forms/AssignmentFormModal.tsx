import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Loader2 } from "lucide-react";
import { Assignment, AssetItem, Employee, Asset } from "@/types";

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

  const selectedAsset = availableItems.find((item) => item.id === form.watch("assetItemId"));
  const selectedEmployee = employees.find((emp) => emp.id === form.watch("employeeId"));

  const getAssetName = (assetId: string) => {
    return assets.find((a) => a.id === assetId)?.name || "Unknown";
  };

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
          <div className="space-y-2">
            <Label>Asset Item *</Label>
            <Popover open={assetPickerOpen} onOpenChange={setAssetPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between">
                  {selectedAsset
                    ? `${selectedAsset.tag || selectedAsset.serial_number || "Asset"} - ${getAssetName(selectedAsset.asset_id)}`
                    : "Search asset items..."}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search by tag, serial, or asset..." />
                  <CommandList>
                    <CommandEmpty>No asset items found.</CommandEmpty>
                    {availableItems.map((item) => (
                      <CommandItem
                        key={item.id}
                        value={`${item.tag || ""} ${item.serial_number || ""} ${getAssetName(item.asset_id)}`}
                        onSelect={() => {
                          form.setValue("assetItemId", item.id);
                          setAssetPickerOpen(false);
                        }}
                      >
                        <span className="font-mono">{item.tag || item.serial_number || "Asset"}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{getAssetName(item.asset_id)}</span>
                      </CommandItem>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {form.formState.errors.assetItemId && (
              <p className="text-sm text-destructive">{form.formState.errors.assetItemId.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Employee *</Label>
            <Popover open={employeePickerOpen} onOpenChange={setEmployeePickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between">
                  {selectedEmployee
                    ? `${selectedEmployee.first_name} ${selectedEmployee.last_name} - ${selectedEmployee.email}`
                    : "Search employees..."}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Type name or email..." />
                  <CommandList>
                    <CommandEmpty>No employees found.</CommandEmpty>
                    {employees
                      .filter((e) => e.is_active)
                      .map((emp) => (
                        <CommandItem
                          key={emp.id}
                          value={`${emp.first_name} ${emp.last_name} ${emp.email}`}
                          onSelect={() => {
                            form.setValue("employeeId", emp.id);
                            setEmployeePickerOpen(false);
                          }}
                        >
                          <span className="font-medium">{emp.first_name} {emp.last_name}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{emp.email}</span>
                        </CommandItem>
                      ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {form.formState.errors.employeeId && (
              <p className="text-sm text-destructive">{form.formState.errors.employeeId.message}</p>
            )}
          </div>

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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Update" : "Create Assignment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
