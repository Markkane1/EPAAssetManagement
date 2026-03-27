import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Employee, Office } from "@/types";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { FormDialogActions } from "@/components/forms/FormDialogActions";

interface EmployeeTransferModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Employee | null;
  offices: Office[];
  onSubmit: (payload: { newOfficeId: string; reason?: string }) => Promise<void>;
}

export function EmployeeTransferModal({
  open,
  onOpenChange,
  employee,
  offices,
  onSubmit,
}: EmployeeTransferModalProps) {
  const [newOfficeId, setNewOfficeId] = useState("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentOfficeId = employee?.location_id || null;
  const officeOptions = useMemo(
    () =>
      offices.filter(
        (office) => office.is_active !== false && office.id !== currentOfficeId
      ),
    [offices, currentOfficeId]
  );

  useEffect(() => {
    if (!open) return;
    setNewOfficeId("");
    setReason("");
    setError(null);
  }, [open, employee?.id]);

  const handleSubmit = async () => {
    if (!newOfficeId) {
      setError("New office is required.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        newOfficeId,
        reason: reason.trim() || undefined,
      });
      onOpenChange(false);
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : "Failed to transfer employee.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Transfer Employee</DialogTitle>
          <DialogDescription>
            Move this employee to a different office and record an optional reason.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Current Office</Label>
            <p className="text-sm text-muted-foreground">
              {offices.find((office) => office.id === currentOfficeId)?.name || "N/A"}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="newOffice">New Office *</Label>
            <SearchableSelect
              id="newOffice"
              value={newOfficeId}
              onValueChange={setNewOfficeId}
              placeholder="Select destination office"
              searchPlaceholder="Search offices..."
              emptyText="No eligible offices available."
              options={officeOptions.map((office) => ({ value: office.id, label: office.name }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="transferReason">Reason</Label>
            <Textarea
              id="transferReason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Optional transfer reason"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <FormDialogActions
          isSubmitting={isSubmitting}
          onCancel={() => onOpenChange(false)}
          submitLabel="Transfer"
          submitType="button"
          onSubmitClick={handleSubmit}
          disableSubmit={officeOptions.length === 0}
        />
      </DialogContent>
    </Dialog>
  );
}
