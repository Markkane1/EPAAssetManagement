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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { District, Division } from "@/types";

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

  useEffect(() => {
    form.reset({
      name: district?.name || "",
      divisionId: district?.division_id || "",
    });
  }, [district, form]);

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
            <Label>Division *</Label>
            <Select
              value={form.watch("divisionId") || undefined}
              onValueChange={(value) => form.setValue("divisionId", value, { shouldValidate: true })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select division" />
              </SelectTrigger>
              <SelectContent>
                {divisions.map((division) => (
                  <SelectItem key={division.id} value={division.id}>
                    {division.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.divisionId && (
              <p className="text-sm text-destructive">{form.formState.errors.divisionId.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
