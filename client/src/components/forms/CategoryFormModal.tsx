import { useEffect, useState } from "react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2 } from "lucide-react";
import { Category } from "@/types";

const categorySchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
  scope: z.enum(["GENERAL", "LAB_ONLY"]),
});

type CategoryFormData = z.infer<typeof categorySchema>;

interface CategoryFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: Category | null;
  onSubmit: (data: CategoryFormData) => Promise<void>;
}

export function CategoryFormModal({ open, onOpenChange, category, onSubmit }: CategoryFormModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = !!category;

  const form = useForm<CategoryFormData>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: category?.name || "",
      description: category?.description || "",
      scope: category?.scope === "LAB_ONLY" ? "LAB_ONLY" : "GENERAL",
    },
  });

  useEffect(() => {
    form.reset({
      name: category?.name || "",
      description: category?.description || "",
      scope: category?.scope === "LAB_ONLY" ? "LAB_ONLY" : "GENERAL",
    });
  }, [category, form, open]);

  const handleSubmit = async (data: CategoryFormData) => {
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
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Category" : "Add Category"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update category details below." : "Create a new asset category."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input id="name" {...form.register("name")} placeholder="e.g., Electronics" />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" {...form.register("description")} placeholder="Optional description..." rows={3} />
          </div>
          <div className="space-y-2">
            <Label>Scope *</Label>
            <RadioGroup
              value={form.watch("scope")}
              onValueChange={(value) => form.setValue("scope", value as "GENERAL" | "LAB_ONLY")}
              className="gap-3"
            >
              <div className="flex items-start gap-2">
                <RadioGroupItem id="scope-general" value="GENERAL" />
                <div>
                  <Label htmlFor="scope-general" className="font-medium">General</Label>
                  <p className="text-xs text-muted-foreground">Available to all offices.</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem id="scope-lab-only" value="LAB_ONLY" />
                <div>
                  <Label htmlFor="scope-lab-only" className="font-medium">Lab Only</Label>
                  <p className="text-xs text-muted-foreground">Only DISTRICT_LAB offices can hold these items.</p>
                </div>
              </div>
            </RadioGroup>
            {form.formState.errors.scope && (
              <p className="text-sm text-destructive">{form.formState.errors.scope.message}</p>
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
