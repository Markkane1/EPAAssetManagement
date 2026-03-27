import { useMemo, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Division } from "@/types";
import { FormDialogActions } from "@/components/forms/FormDialogActions";
import { useDialogFormReset } from "@/components/forms/useDialogFormReset";

const divisionSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
});

type DivisionFormData = z.infer<typeof divisionSchema>;

interface DivisionFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  division?: Division | null;
  onSubmit: (data: DivisionFormData) => Promise<void>;
}

export function DivisionFormModal({ open, onOpenChange, division, onSubmit }: DivisionFormModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = !!division;

  const form = useForm<DivisionFormData>({
    resolver: zodResolver(divisionSchema),
    defaultValues: {
      name: division?.name || "",
    },
  });

  const resetValues = useMemo(
    () => ({ name: division?.name || "" }),
    [division]
  );
  useDialogFormReset({ open, form, values: resetValues });

  const handleSubmit = async (data: DivisionFormData) => {
    setIsSubmitting(true);
    try {
      await onSubmit(data);
      form.reset();
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Division" : "Add Division"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update division details below." : "Create a new division."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input id="name" {...form.register("name")} placeholder="e.g., Operations" />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <FormDialogActions
            isSubmitting={isSubmitting}
            onCancel={() => onOpenChange(false)}
            submitLabel={isEditing ? "Update" : "Create"}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}
