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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRight } from "lucide-react";
import { AssetItem, Employee, Asset, Assignment } from "@/types";
import { getOfficeHolderId } from "@/lib/assetItemHolder";
import { FormDialogActions } from "@/components/forms/FormDialogActions";
import { isAssetItemAssignable } from "@/lib/assetItemStatusRules";

const reassignSchema = z.object({
  assignmentId: z.string().min(1, "Assignment is required"),
  newEmployeeId: z.string().min(1, "New employee is required"),
  notes: z.string().max(500).optional(),
});

type ReassignFormData = z.infer<typeof reassignSchema>;

interface ReassignmentFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignments: Assignment[];
  assetItems: AssetItem[];
  employees: Employee[];
  assets: Asset[];
  onSubmit: (data: { assignmentId: string; newEmployeeId: string; notes?: string }) => Promise<void>;
}

export function ReassignmentFormModal({
  open,
  onOpenChange,
  assignments,
  assetItems,
  employees,
  assets,
  onSubmit,
}: ReassignmentFormModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<ReassignFormData>({
    resolver: zodResolver(reassignSchema),
    defaultValues: {
      assignmentId: "",
      newEmployeeId: "",
      notes: "",
    },
  });

  const selectedAssignmentId = form.watch("assignmentId");
  const selectedAssignment = assignments.find(a => a.id === selectedAssignmentId);
  const currentEmployee = selectedAssignment 
    ? employees.find(e => e.id === selectedAssignment.employee_id) 
    : null;
  const currentAssetItem = selectedAssignment
    ? assetItems.find(i => i.id === selectedAssignment.asset_item_id)
    : null;
  const currentAsset = currentAssetItem
    ? assets.find(a => a.id === currentAssetItem.asset_id)
    : null;

  // Filter employees at same location (excluding current assignee)
  const availableEmployees = employees.filter(e => {
    const officeId = currentAssetItem ? getOfficeHolderId(currentAssetItem) : null;
    if (!officeId) return true;
    return e.location_id === officeId && e.id !== currentEmployee?.id;
  });

  const reassignableAssignments = assignments.filter((assignment) => {
    if (String(assignment.status || "") !== "RETURNED") return false;
    const item = assetItems.find((entry) => entry.id === assignment.asset_item_id);
    return item ? isAssetItemAssignable(item) : false;
  });

  useEffect(() => {
    if (open) {
      form.reset({
        assignmentId: "",
        newEmployeeId: "",
        notes: "",
      });
    }
  }, [open, form]);

  const handleSubmit = async (data: ReassignFormData) => {
    setIsSubmitting(true);
    try {
      await onSubmit({
        assignmentId: data.assignmentId,
        newEmployeeId: data.newEmployeeId,
        notes: data.notes,
      });
      form.reset();
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getAssetLabel = (assignment: Assignment) => {
    const item = assetItems.find(i => i.id === assignment.asset_item_id);
    const asset = item ? assets.find(a => a.id === item.asset_id) : null;
    const employee = employees.find(e => e.id === assignment.employee_id);
    return `${item?.tag || "N/A"} - ${asset?.name || "Unknown"} (${employee?.first_name} ${employee?.last_name})`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Reassign Asset</DialogTitle>
          <DialogDescription>
            Reissue a returned, assignable asset to another employee at the same location.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Select Assignment *</Label>
            <Select 
              value={form.watch("assignmentId")} 
              onValueChange={(v) => {
                form.setValue("assignmentId", v);
                form.setValue("newEmployeeId", ""); // Reset new employee when assignment changes
              }}
            >
              <SelectTrigger><SelectValue placeholder="Select a returned assignment" /></SelectTrigger>
              <SelectContent>
                {reassignableAssignments.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground text-center">
                    No returned assignable assets available
                  </div>
                ) : (
                  reassignableAssignments.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {getAssetLabel(a)}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {form.formState.errors.assignmentId && (
              <p className="text-sm text-destructive">{form.formState.errors.assignmentId.message}</p>
            )}
          </div>

          {selectedAssignment && (
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">Asset:</span>
                <span className="font-mono text-primary">{currentAssetItem?.tag}</span>
                <span>- {currentAsset?.name}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">Current Assignee:</span>
                <span>{currentEmployee?.first_name} {currentEmployee?.last_name}</span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Reassign To (New Employee) *</Label>
            <Select 
              value={form.watch("newEmployeeId")} 
              onValueChange={(v) => form.setValue("newEmployeeId", v)}
              disabled={!selectedAssignment}
            >
              <SelectTrigger>
                <SelectValue placeholder={selectedAssignment ? "Select new employee" : "Select assignment first"} />
              </SelectTrigger>
              <SelectContent>
                {availableEmployees.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground text-center">
                    No other employees at this location
                  </div>
                ) : (
                  availableEmployees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.first_name} {e.last_name} - {e.job_title || "No title"}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {form.formState.errors.newEmployeeId && (
              <p className="text-sm text-destructive">{form.formState.errors.newEmployeeId.message}</p>
            )}
          </div>

          {selectedAssignment && form.watch("newEmployeeId") && (
            <div className="flex items-center justify-center gap-4 py-2">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">From</p>
                <p className="font-medium">{currentEmployee?.first_name} {currentEmployee?.last_name}</p>
              </div>
              <ArrowRight className="h-5 w-5 text-primary" />
              <div className="text-center">
                <p className="text-sm text-muted-foreground">To</p>
                <p className="font-medium">
                  {employees.find(e => e.id === form.watch("newEmployeeId"))?.first_name}{" "}
                  {employees.find(e => e.id === form.watch("newEmployeeId"))?.last_name}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Reason / Notes</Label>
            <Textarea 
              id="notes" 
              {...form.register("notes")} 
              placeholder="Reason for reassignment..." 
              rows={2} 
            />
          </div>

          <FormDialogActions
            isSubmitting={isSubmitting}
            onCancel={() => onOpenChange(false)}
            submitLabel="Reassign Asset"
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}
