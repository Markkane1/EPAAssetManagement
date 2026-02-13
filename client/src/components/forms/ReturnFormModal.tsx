import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { AssetItem, Employee, Asset, Assignment } from "@/types";

const returnSchema = z.object({
  assignmentId: z.string().min(1, "Assignment is required"),
  returnDate: z.string().min(1, "Return date is required"),
  condition: z.string().min(1, "Condition is required"),
  notes: z.string().max(500).optional(),
});

type ReturnFormData = z.infer<typeof returnSchema>;

interface ReturnFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignments: Assignment[];
  assetItems: AssetItem[];
  employees: Employee[];
  assets: Asset[];
  onSubmit: (data: { assignmentId: string; returnDate: string; condition: string; notes?: string }) => Promise<void>;
}

const conditionOptions = ["New", "Good", "Fair", "Poor", "Damaged"];

export function ReturnFormModal({
  open,
  onOpenChange,
  assignments,
  assetItems,
  employees,
  assets,
  onSubmit,
}: ReturnFormModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<ReturnFormData>({
    resolver: zodResolver(returnSchema),
    defaultValues: {
      assignmentId: "",
      returnDate: new Date().toISOString().split("T")[0],
      condition: "Good",
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

  // Filter only active assignments
  const activeAssignments = assignments.filter(a => a.is_active);

  const handleSubmit = async (data: ReturnFormData) => {
    setIsSubmitting(true);
    try {
      await onSubmit({
        assignmentId: data.assignmentId,
        returnDate: data.returnDate,
        condition: data.condition,
        notes: data.notes,
      });
      form.reset({
        assignmentId: "",
        returnDate: new Date().toISOString().split("T")[0],
        condition: "Good",
        notes: "",
      });
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
          <DialogTitle>Record Asset Return</DialogTitle>
          <DialogDescription>
            Record the return of an assigned asset from an employee.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Select Assignment *</Label>
            <Select 
              value={form.watch("assignmentId")} 
              onValueChange={(v) => form.setValue("assignmentId", v)}
            >
              <SelectTrigger><SelectValue placeholder="Select an active assignment" /></SelectTrigger>
              <SelectContent>
                {activeAssignments.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground text-center">
                    No active assignments to return
                  </div>
                ) : (
                  activeAssignments.map((a) => (
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
                <span className="font-medium">Assigned To:</span>
                <span>{currentEmployee?.first_name} {currentEmployee?.last_name}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">Assigned On:</span>
                <span>{new Date(selectedAssignment.assigned_date).toLocaleDateString()}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="returnDate">Return Date *</Label>
              <Input 
                id="returnDate" 
                type="date" 
                {...form.register("returnDate")} 
              />
              {form.formState.errors.returnDate && (
                <p className="text-sm text-destructive">{form.formState.errors.returnDate.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Condition on Return *</Label>
              <Select 
                value={form.watch("condition")} 
                onValueChange={(v) => form.setValue("condition", v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {conditionOptions.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.condition && (
                <p className="text-sm text-destructive">{form.formState.errors.condition.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea 
              id="notes" 
              {...form.register("notes")} 
              placeholder="Any notes about the return (damages, missing parts, etc.)..." 
              rows={2} 
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record Return
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}