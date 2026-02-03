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
import { Loader2 } from "lucide-react";
import { Division } from "@/types";

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

  useEffect(() => {
    form.reset({ name: division?.name || "" });
  }, [division, form]);

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
