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
import { Asset, Location } from "@/types";

const assetItemSchema = z.object({
  assetId: z.string().min(1, "Asset is required"),
  locationId: z.string().min(1, "Location is required"),
  itemStatus: z.string().default("Available"),
  itemCondition: z.string().default("New"),
  functionalStatus: z.string().default("Functional"),
  notes: z.string().max(500).optional(),
});

type AssetItemFormData = z.infer<typeof assetItemSchema>;

interface AssetItemFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assets: Asset[];
  locations: Location[];
  onSubmit: (data: {
    assetId: string;
    locationId: string;
    itemStatus: string;
    itemCondition: string;
    functionalStatus: string;
    notes?: string;
    items: Array<{ serialNumber: string; warrantyExpiry?: string }>;
  }) => Promise<void>;
}

const statusOptions = ["Available", "Assigned", "Maintenance", "Damaged", "Retired"];
const conditionOptions = ["New", "Good", "Fair", "Poor", "Damaged"];
const functionalOptions = ["Functional", "Need Repairs", "Dead"];

export function AssetItemFormModal({ open, onOpenChange, assets, locations, onSubmit }: AssetItemFormModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<AssetItemFormData>({
    resolver: zodResolver(assetItemSchema),
    defaultValues: {
      assetId: "",
      locationId: "",
      itemStatus: "Available",
      itemCondition: "New",
      functionalStatus: "Functional",
      notes: "",
    },
  });

  const [items, setItems] = useState<Array<{ id: string; serialNumber: string; warrantyExpiry?: string }>>([
    { id: crypto.randomUUID(), serialNumber: "", warrantyExpiry: "" },
  ]);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const selectedAssetId = form.watch("assetId");
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId);
  const assetQuantity = selectedAsset?.quantity || 0;

  useEffect(() => {
    if (open) {
      form.reset({
        assetId: "",
        locationId: "",
        itemStatus: "Available",
        itemCondition: "New",
        functionalStatus: "Functional",
        notes: "",
      });
      setItems([{ id: crypto.randomUUID(), serialNumber: "", warrantyExpiry: "" }]);
      setItemsError(null);
    }
  }, [open, form]);

  const handleSubmit = async (data: AssetItemFormData) => {
    setIsSubmitting(true);
    try {
      const normalizedItems = items
        .map((item) => ({
          serialNumber: item.serialNumber.trim(),
          warrantyExpiry: item.warrantyExpiry || undefined,
        }))
        .filter((item) => item.serialNumber.length > 0);

      if (normalizedItems.length === 0) {
        setItemsError("Add at least one serial number.");
        return;
      }

      if (normalizedItems.length !== items.length) {
        setItemsError("Serial number is required for each row.");
        return;
      }

      if (assetQuantity && normalizedItems.length > assetQuantity) {
        setItemsError(`Only ${assetQuantity} items can be added for this asset.`);
        return;
      }

      setItemsError(null);

      await onSubmit({
        assetId: data.assetId,
        locationId: data.locationId,
        itemStatus: data.itemStatus,
        itemCondition: data.itemCondition,
        functionalStatus: data.functionalStatus,
        notes: data.notes,
        items: normalizedItems,
      });
      form.reset();
      setItems([{ id: crypto.randomUUID(), serialNumber: "", warrantyExpiry: "" }]);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateItem = (id: string, patch: Partial<{ serialNumber: string; warrantyExpiry?: string }>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const addRow = () => {
    if (assetQuantity && items.length >= assetQuantity) {
      setItemsError(`Only ${assetQuantity} items can be added for this asset.`);
      return;
    }
    setItems((prev) => [...prev, { id: crypto.randomUUID(), serialNumber: "", warrantyExpiry: "" }]);
  };

  const removeRow = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Asset Item</DialogTitle>
          <DialogDescription>
            Register a new individual asset item with unique tag and serial number.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Asset *</Label>
              <Select value={form.watch("assetId")} onValueChange={(v) => form.setValue("assetId", v)}>
                <SelectTrigger><SelectValue placeholder="Select asset" /></SelectTrigger>
                <SelectContent>
                  {assets.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.assetId && (
                <p className="text-sm text-destructive">{form.formState.errors.assetId.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Location *</Label>
              <Select value={form.watch("locationId")} onValueChange={(v) => form.setValue("locationId", v)}>
                <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.locationId && (
                <p className="text-sm text-destructive">{form.formState.errors.locationId.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.watch("itemStatus")} onValueChange={(v) => form.setValue("itemStatus", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statusOptions.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Condition</Label>
              <Select value={form.watch("itemCondition")} onValueChange={(v) => form.setValue("itemCondition", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {conditionOptions.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Functional Status</Label>
              <Select value={form.watch("functionalStatus")} onValueChange={(v) => form.setValue("functionalStatus", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {functionalOptions.map((status) => (
                    <SelectItem key={status} value={status}>{status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" {...form.register("notes")} placeholder="Additional notes..." rows={2} />
          </div>

          <div className="space-y-2">
            <Label>Items *</Label>
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2">Serial Number</th>
                    <th className="text-left px-3 py-2">Warranty Expiry</th>
                    <th className="w-[60px] px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-t">
                      <td className="px-3 py-2">
                        <Input
                          value={item.serialNumber}
                          onChange={(e) => updateItem(item.id, { serialNumber: e.target.value })}
                          placeholder="e.g., SN123456789"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="date"
                          value={item.warrantyExpiry || ""}
                          onChange={(e) => updateItem(item.id, { warrantyExpiry: e.target.value })}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeRow(item.id)}
                          disabled={items.length === 1}
                        >
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {itemsError && <p className="text-sm text-destructive">{itemsError}</p>}
            <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={!selectedAssetId || (assetQuantity > 0 && items.length >= assetQuantity)}>
              Add Row
            </Button>
            {selectedAssetId && assetQuantity > 0 && (
              <p className="text-xs text-muted-foreground">
                {items.length} of {assetQuantity} items
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Item
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
