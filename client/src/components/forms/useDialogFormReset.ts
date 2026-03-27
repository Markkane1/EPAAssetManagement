import { useEffect } from "react";
import type { FieldValues, UseFormReturn } from "react-hook-form";

interface UseDialogFormResetOptions<TFieldValues extends FieldValues> {
  open: boolean;
  form: UseFormReturn<TFieldValues>;
  values: TFieldValues;
}

export function useDialogFormReset<TFieldValues extends FieldValues>({
  open,
  form,
  values,
}: UseDialogFormResetOptions<TFieldValues>) {
  useEffect(() => {
    if (!open) return;
    form.reset(values);
  }, [open, form, values]);
}
