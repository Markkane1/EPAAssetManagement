import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { Employee, Office } from "@/types";

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
            <Select value={newOfficeId} onValueChange={setNewOfficeId}>
              <SelectTrigger id="newOffice">
                <SelectValue placeholder="Select destination office" />
              </SelectTrigger>
              <SelectContent>
                {officeOptions.length === 0 ? (
                  <SelectItem value="__none__" disabled>
                    No eligible offices available
                  </SelectItem>
                ) : (
                  officeOptions.map((office) => (
                    <SelectItem key={office.id} value={office.id}>
                      {office.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
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

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || officeOptions.length === 0}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

