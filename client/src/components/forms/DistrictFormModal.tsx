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
import type { District, Division } from "@/types";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { FormDialogActions } from "@/components/forms/FormDialogActions";
import { useDialogFormReset } from "@/components/forms/useDialogFormReset";

const districtSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  divisionId: z.string().min(1, "Division is required"),
});

type DistrictFormData = z.infer<typeof districtSchema>;

interface DistrictFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  district?: District | null;
  divisions: Division[];
  onSubmit: (data: DistrictFormData) => Promise<void>;
}

export function DistrictFormModal({
  open,
  onOpenChange,
  district,
  divisions,
  onSubmit,
}: DistrictFormModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = !!district;

  const form = useForm<DistrictFormData>({
    resolver: zodResolver(districtSchema),
    defaultValues: {
      name: district?.name || "",
      divisionId: district?.division_id || "",
    },
  });

  const resetValues = useMemo(
    () => ({
      name: district?.name || "",
      divisionId: district?.division_id || "",
    }),
    [district]
  );
  useDialogFormReset({ open, form, values: resetValues });

  const handleSubmit = async (data: DistrictFormData) => {
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
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit District" : "Add District"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update district details below." : "Create a new district."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input id="name" {...form.register("name")} placeholder="e.g., North District" />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="district-division">Division *</Label>
            <SearchableSelect
              id="district-division"
              value={form.watch("divisionId") || ""}
              onValueChange={(value) => form.setValue("divisionId", value, { shouldValidate: true })}
              placeholder="Select division"
              searchPlaceholder="Search divisions..."
              emptyText="No divisions found."
              options={divisions.map((division) => ({
                value: division.id,
                label: division.name,
              }))}
            />
            {form.formState.errors.divisionId && (
              <p className="text-sm text-destructive">{form.formState.errors.divisionId.message}</p>
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
