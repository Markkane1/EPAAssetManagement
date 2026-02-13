import { useEffect, useMemo, useState } from "react";
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
import { ConsumableAsset, Employee, Location, ConsumableAssigneeType } from "@/types";
import { convertQuantity, getCompatibleUnits } from "@/lib/unitUtils";
import { useAuth } from "@/contexts/AuthContext";

const assignSchema = z.object({
  assigneeType: z.enum(["employee", "location"]),
  assigneeId: z.string().min(1, "Assignee is required"),
  receivedByEmployeeId: z.string().optional(),
  quantity: z.coerce.number().min(0.01, "Quantity must be greater than 0"),
  unit: z.string().min(1, "Unit is required"),
  assignedDate: z.string().min(1, "Date is required"),
  notes: z.string().max(500).optional(),
}).superRefine((data, ctx) => {
  if (data.assigneeType === "location" && !data.receivedByEmployeeId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Receiving employee is required for location assignments",
      path: ["receivedByEmployeeId"],
    });
  }
});

type AssignFormData = z.infer<typeof assignSchema>;
type AssignSubmitData = AssignFormData & { inputQuantity: number; inputUnit: string };

interface ConsumableAssignModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  consumable: ConsumableAsset | null;
  employees: Employee[];
  locations: Location[];
  onSubmit: (data: AssignSubmitData) => Promise<void>;
}

export function ConsumableAssignModal({
  open,
  onOpenChange,
  consumable,
  employees,
  locations,
  onSubmit,
}: ConsumableAssignModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { role, user } = useAuth();

  const form = useForm<AssignFormData>({
    resolver: zodResolver(assignSchema),
    defaultValues: {
      assigneeType: "employee",
      assigneeId: "",
      receivedByEmployeeId: undefined,
      quantity: 0,
      unit: consumable?.unit || "",
      assignedDate: new Date().toISOString().split("T")[0],
      notes: "",
    },
  });

  const assigneeType = form.watch("assigneeType");
  const assigneeId = form.watch("assigneeId");
  const currentEmployee = user
    ? employees.find((employee) => employee.email?.toLowerCase() === user.email.toLowerCase())
    : undefined;
  const available = consumable?.available_quantity ?? 0;

  const assignees = useMemo(() => {
    if (assigneeType === "employee") {
      let list = employees.filter((emp) => emp.is_active);
      if (role === "directorate_head" && currentEmployee?.directorate_id) {
        list = list.filter((emp) => emp.directorate_id === currentEmployee.directorate_id);
      }
      return list;
    }
    return locations;
  }, [assigneeType, employees, locations, role, currentEmployee]);

  useEffect(() => {
    if (!open) return;
    form.reset({
      assigneeType: "employee",
      assigneeId: "",
      receivedByEmployeeId: undefined,
      quantity: 0,
      unit: consumable?.unit || "",
      assignedDate: new Date().toISOString().split("T")[0],
      notes: "",
    });
  }, [open, form, consumable]);

  useEffect(() => {
    if (role === "directorate_head" && assigneeType !== "employee") {
      form.setValue("assigneeType", "employee");
    }
  }, [role, assigneeType, form]);

  useEffect(() => {
    form.setValue("assigneeId", "");
    form.setValue("receivedByEmployeeId", undefined);
  }, [assigneeType, form]);

  const receiverCandidates = useMemo(() => {
    if (assigneeType !== "location" || !assigneeId) return [];
    return employees.filter((emp) => emp.is_active && emp.location_id === assigneeId);
  }, [assigneeType, assigneeId, employees]);

  const handleSubmit = async (data: AssignFormData) => {
    if (!consumable) return;
    const converted = convertQuantity(data.quantity, data.unit, consumable.unit);
    if (converted === null) {
      form.setError("unit", { message: "Unit is not compatible" });
      return;
    }
    if (converted > available) {
      form.setError("quantity", { message: "Quantity exceeds available stock" });
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit({
        ...data,
        quantity: converted,
        inputQuantity: data.quantity,
        inputUnit: data.unit,
        receivedByEmployeeId: data.assigneeType === "location" ? data.receivedByEmployeeId : undefined,
      });
      form.reset();
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Assign Consumable</DialogTitle>
          <DialogDescription>
            Allocate a portion of stock to an employee or location.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            {consumable
              ? `Available: ${available} ${consumable.unit}`
              : "Select a consumable first"}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Assign To *</Label>
              <Select
                value={assigneeType}
                onValueChange={(v) => form.setValue("assigneeType", v as ConsumableAssigneeType)}
                disabled={role === "directorate_head"}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="location">Location</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Assignee *</Label>
              <Select value={form.watch("assigneeId")} onValueChange={(v) => form.setValue("assigneeId", v)}>
                <SelectTrigger><SelectValue placeholder="Select assignee" /></SelectTrigger>
                <SelectContent>
                  {assignees.map((assignee) => (
                    <SelectItem key={assignee.id} value={assignee.id}>
                      {"first_name" in assignee
                        ? `${assignee.first_name} ${assignee.last_name}`
                        : assignee.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.assigneeId && (
                <p className="text-sm text-destructive">{form.formState.errors.assigneeId.message}</p>
              )}
            </div>
          </div>
          {assigneeType === "location" && (
            <div className="space-y-2">
              <Label>Received By (Employee) *</Label>
              <Select
                value={form.watch("receivedByEmployeeId")}
                onValueChange={(v) => form.setValue("receivedByEmployeeId", v)}
              >
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {receiverCandidates.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.first_name} {employee.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.receivedByEmployeeId && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.receivedByEmployeeId.message}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity *</Label>
              <Input id="quantity" type="number" step="0.01" {...form.register("quantity")} />
              {form.formState.errors.quantity && (
                <p className="text-sm text-destructive">{form.formState.errors.quantity.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Unit *</Label>
              <Select value={form.watch("unit")} onValueChange={(v) => form.setValue("unit", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(consumable ? getCompatibleUnits(consumable.unit) : [])
                    .filter((unit) => unit)
                    .map((unit) => (
                    <SelectItem key={unit} value={unit}>
                      {unit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.unit && (
                <p className="text-sm text-destructive">{form.formState.errors.unit.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="assignedDate">Assigned Date *</Label>
            <Input id="assignedDate" type="date" {...form.register("assignedDate")} />
            {form.formState.errors.assignedDate && (
              <p className="text-sm text-destructive">{form.formState.errors.assignedDate.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" {...form.register("notes")} rows={2} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !consumable}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Assign
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
