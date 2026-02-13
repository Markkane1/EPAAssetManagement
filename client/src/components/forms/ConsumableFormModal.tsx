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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { Category, ConsumableAsset } from "@/types";

const consumableSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  description: z.string().max(500).optional(),
  categoryId: z.string().optional(),
  unit: z.string().min(1, "Unit is required").max(20),
  totalQuantity: z.coerce.number().min(0, "Quantity cannot be less than 0"),
  acquisitionDate: z.string().min(1, "Date is required"),
});

type ConsumableFormData = z.infer<typeof consumableSchema>;

interface ConsumableFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  consumable?: ConsumableAsset | null;
  categories: Category[];
  onSubmit: (data: ConsumableFormData) => Promise<void>;
}

export function ConsumableFormModal({
  open,
  onOpenChange,
  consumable,
  categories,
  onSubmit,
}: ConsumableFormModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = !!consumable;

  const form = useForm<ConsumableFormData>({
    resolver: zodResolver(consumableSchema),
    defaultValues: {
      name: consumable?.name || "",
      description: consumable?.description || "",
      categoryId: consumable?.category_id || "",
      unit: consumable?.unit || "",
      totalQuantity: consumable?.total_quantity || 0,
      acquisitionDate: new Date().toISOString().split("T")[0],
    },
  });

  useEffect(() => {
    if (consumable) {
      form.reset({
        name: consumable.name,
        description: consumable.description || "",
        categoryId: consumable.category_id || "",
        unit: consumable.unit,
        totalQuantity: consumable.total_quantity || 0,
      acquisitionDate: consumable.acquisition_date
          ? new Date(consumable.acquisition_date).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0],
      });
    } else {
      form.reset({
        name: "",
        description: "",
        categoryId: "",
        unit: "",
        totalQuantity: 0,
        acquisitionDate: new Date().toISOString().split("T")[0],
      });
    }
  }, [consumable, form]);

  const handleSubmit = async (data: ConsumableFormData) => {
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
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Consumable" : "Add Consumable"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update consumable details." : "Create a new consumable inventory item."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input id="name" {...form.register("name")} placeholder="e.g., Sodium Chloride" />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.watch("categoryId") || ""} onValueChange={(v) => form.setValue("categoryId", v)}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit">Unit *</Label>
              <Input id="unit" {...form.register("unit")} placeholder="kg, g, mg, ml, cc, pcs" />
              {form.formState.errors.unit && (
                <p className="text-sm text-destructive">{form.formState.errors.unit.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="totalQuantity">Total Quantity *</Label>
              <Input id="totalQuantity" type="number" min={0} step="0.01" {...form.register("totalQuantity")} />
              {form.formState.errors.totalQuantity && (
                <p className="text-sm text-destructive">{form.formState.errors.totalQuantity.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="acquisitionDate">Date *</Label>
              <Input id="acquisitionDate" type="date" {...form.register("acquisitionDate")} />
              {form.formState.errors.acquisitionDate && (
                <p className="text-sm text-destructive">{form.formState.errors.acquisitionDate.message}</p>
              )}
            </div>
            {isEditing && (
              <div className="space-y-2">
                <Label>Available Quantity</Label>
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  {consumable?.available_quantity ?? 0}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" {...form.register("description")} rows={3} placeholder="Optional notes..." />
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
