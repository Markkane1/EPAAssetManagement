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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormDialogActions } from "@/components/forms/FormDialogActions";
import { useDialogFormReset } from "@/components/forms/useDialogFormReset";
import type { Category, CategoryAssetType } from "@/types";

const subcategorySchema = z.object({
  categoryId: z.string().min(1, "Category is required"),
  name: z.string().min(1, "Subcategory name is required").max(100, "Subcategory name must be 100 characters or fewer"),
});

type SubcategoryFormData = z.infer<typeof subcategorySchema>;

interface SubcategoryFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  selectedAssetType: CategoryAssetType | "ALL";
  initialValue?: {
    categoryId: string;
    name: string;
    previousCategoryId?: string;
    previousName?: string;
  } | null;
  onSubmit: (data: {
    categoryId: string;
    name: string;
    previousCategoryId?: string;
    previousName?: string;
  }) => Promise<void>;
}

export function SubcategoryFormModal({
  open,
  onOpenChange,
  categories,
  selectedAssetType,
  initialValue,
  onSubmit,
}: SubcategoryFormModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const isEditing = Boolean(initialValue);

  const eligibleCategories = useMemo(
    () =>
      categories.filter((category) =>
        selectedAssetType === "ALL" ? true : (category.asset_type || "ASSET") === selectedAssetType
      ),
    [categories, selectedAssetType]
  );

  const fallbackCategoryId = useMemo(() => {
    if (initialValue?.categoryId) return initialValue.categoryId;
    return eligibleCategories[0]?.id || "";
  }, [eligibleCategories, initialValue?.categoryId]);

  const form = useForm<SubcategoryFormData>({
    resolver: zodResolver(subcategorySchema),
    defaultValues: {
      categoryId: initialValue?.categoryId || fallbackCategoryId,
      name: initialValue?.name || "",
    },
  });

  const resetValues = useMemo(
    () => ({
      categoryId: initialValue?.categoryId || fallbackCategoryId,
      name: initialValue?.name || "",
    }),
    [fallbackCategoryId, initialValue]
  );
  useDialogFormReset({ open, form, values: resetValues });

  const handleSubmit = async (data: SubcategoryFormData) => {
    setIsSubmitting(true);
    try {
      setSubmitError(null);
      await onSubmit({
        categoryId: data.categoryId,
        name: data.name.trim(),
        previousCategoryId: initialValue?.previousCategoryId || initialValue?.categoryId,
        previousName: initialValue?.previousName || initialValue?.name,
      });
      form.reset();
      onOpenChange(false);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to save subcategory");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Subcategory" : "Add Subcategory"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update the subcategory and its parent category." : "Create a subcategory under an existing category."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Category *</Label>
            <Select
              value={form.watch("categoryId")}
              onValueChange={(value) => form.setValue("categoryId", value, { shouldValidate: true, shouldDirty: true })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {eligibleCategories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.categoryId && (
              <p className="text-sm text-destructive">{form.formState.errors.categoryId.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="subcategory-name">Subcategory Name *</Label>
            <Input id="subcategory-name" {...form.register("name")} placeholder="e.g., Laptops" />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          {submitError && <p className="text-sm text-destructive">{submitError}</p>}
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
