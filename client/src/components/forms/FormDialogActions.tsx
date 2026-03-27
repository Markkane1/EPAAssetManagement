import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";

interface FormDialogActionsProps {
  isSubmitting: boolean;
  onCancel: () => void;
  submitLabel: string;
  cancelLabel?: string;
  disableSubmit?: boolean;
  submitType?: "submit" | "button";
  onSubmitClick?: () => void;
}

export function FormDialogActions({
  isSubmitting,
  onCancel,
  submitLabel,
  cancelLabel = "Cancel",
  disableSubmit = false,
  submitType = "submit",
  onSubmitClick,
}: FormDialogActionsProps) {
  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
        {cancelLabel}
      </Button>
      <Button type={submitType} onClick={onSubmitClick} disabled={isSubmitting || disableSubmit}>
        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {submitLabel}
      </Button>
    </DialogFooter>
  );
}
