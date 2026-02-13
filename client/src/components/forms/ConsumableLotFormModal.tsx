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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { ConsumableItem, ConsumableLot, ConsumableSupplier } from "@/types";

const lotSchema = z.object({
  itemId: z.string().min(1, "Item is required"),
  supplierId: z.string().optional(),
  lotNumber: z.string().min(1, "Lot number is required").max(120),
  receivedDate: z.string().min(1, "Received date is required"),
  expiryDate: z.string().optional(),
});

type LotFormData = z.infer<typeof lotSchema>;

interface ConsumableLotFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lot?: ConsumableLot | null;
  items: ConsumableItem[];
  suppliers: ConsumableSupplier[];
  onSubmit: (data: LotFormData) => Promise<void>;
}

export function ConsumableLotFormModal({
  open,
  onOpenChange,
  lot,
  items,
  suppliers,
  onSubmit,
}: ConsumableLotFormModalProps) {
  const NONE_VALUE = "__none__";
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = !!lot;

  const form = useForm<LotFormData>({
    resolver: zodResolver(lotSchema),
    defaultValues: {
      itemId: lot?.consumable_item_id || "",
      supplierId: lot?.supplier_id || "",
      lotNumber: lot?.lot_number || "",
      receivedDate: lot?.received_date
        ? new Date(lot.received_date).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0],
      expiryDate: lot?.expiry_date
        ? new Date(lot.expiry_date).toISOString().split("T")[0]
        : "",
    },
  });

  useEffect(() => {
    if (lot) {
      form.reset({
        itemId: lot.consumable_item_id,
        supplierId: lot.supplier_id || "",
        lotNumber: lot.lot_number,
        receivedDate: lot.received_date
          ? new Date(lot.received_date).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0],
        expiryDate: lot.expiry_date
          ? new Date(lot.expiry_date).toISOString().split("T")[0]
          : "",
      });
    } else {
      form.reset({
        itemId: "",
        supplierId: "",
        lotNumber: "",
        receivedDate: new Date().toISOString().split("T")[0],
        expiryDate: "",
      });
    }
  }, [lot, form]);

  const handleSubmit = async (data: LotFormData) => {
    setIsSubmitting(true);
    try {
      await onSubmit({
        ...data,
        supplierId: data.supplierId || undefined,
        expiryDate: data.expiryDate || undefined,
      });
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Lot" : "Add Lot"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update lot details." : "Create a new lot record."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Item *</Label>
            <Select value={form.watch("itemId")} onValueChange={(v) => form.setValue("itemId", v)}>
              <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.itemId && (
              <p className="text-sm text-destructive">{form.formState.errors.itemId.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="lotNumber">Lot Number *</Label>
              <Input id="lotNumber" {...form.register("lotNumber")} />
              {form.formState.errors.lotNumber && (
                <p className="text-sm text-destructive">{form.formState.errors.lotNumber.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Supplier</Label>
              <Select
                value={form.watch("supplierId") || NONE_VALUE}
                onValueChange={(v) => form.setValue("supplierId", v === NONE_VALUE ? "" : v)}
              >
                <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>None</SelectItem>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="receivedDate">Received Date *</Label>
              <Input id="receivedDate" type="date" {...form.register("receivedDate")} />
              {form.formState.errors.receivedDate && (
                <p className="text-sm text-destructive">{form.formState.errors.receivedDate.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="expiryDate">Expiry Date</Label>
              <Input id="expiryDate" type="date" {...form.register("expiryDate")} />
            </div>
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
