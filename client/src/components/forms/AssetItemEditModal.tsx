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
import { Asset, AssetItem, Location } from "@/types";

const assetItemEditSchema = z.object({
  assetId: z.string().min(1, "Asset is required"),
  locationId: z.string().min(1, "Location is required"),
  serialNumber: z.string().optional(),
  warrantyExpiry: z.string().optional(),
  itemStatus: z.string().default("Available"),
  itemCondition: z.string().default("New"),
  functionalStatus: z.string().default("Functional"),
  notes: z.string().max(500).optional(),
});

type AssetItemEditFormData = z.infer<typeof assetItemEditSchema>;

interface AssetItemEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetItem: AssetItem | null;
  assets: Asset[];
  locations: Location[];
  onSubmit: (data: {
    assetId: string;
    locationId: string;
    serialNumber?: string | null;
    warrantyExpiry?: string | null;
    itemStatus: string;
    itemCondition: string;
    functionalStatus: string;
    notes?: string;
  }) => Promise<void>;
}

const statusOptions = ["Available", "Assigned", "Maintenance", "Damaged", "Retired"];
const conditionOptions = ["New", "Good", "Fair", "Poor", "Damaged"];
const functionalOptions = ["Functional", "Need Repairs", "Dead"];

export function AssetItemEditModal({
  open,
  onOpenChange,
  assetItem,
  assets,
  locations,
  onSubmit,
}: AssetItemEditModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<AssetItemEditFormData>({
    resolver: zodResolver(assetItemEditSchema),
    defaultValues: {
      assetId: "",
      locationId: "",
      serialNumber: "",
      warrantyExpiry: "",
      itemStatus: "Available",
      itemCondition: "New",
      functionalStatus: "Functional",
      notes: "",
    },
  });

  useEffect(() => {
    if (open && assetItem) {
      form.reset({
        assetId: assetItem.asset_id || "",
        locationId: assetItem.location_id || "",
        serialNumber: assetItem.serial_number || "",
        warrantyExpiry: assetItem.warranty_expiry || "",
        itemStatus: assetItem.item_status || "Available",
        itemCondition: assetItem.item_condition || "New",
        functionalStatus: assetItem.functional_status || "Functional",
        notes: assetItem.notes || "",
      });
    }
  }, [open, assetItem, form]);

  const handleSubmit = async (data: AssetItemEditFormData) => {
    setIsSubmitting(true);
    try {
      const normalizedSerial = data.serialNumber?.trim();
      const normalizedWarranty = data.warrantyExpiry?.trim();

      await onSubmit({
        assetId: data.assetId,
        locationId: data.locationId,
        serialNumber: normalizedSerial ? normalizedSerial : null,
        warrantyExpiry: normalizedWarranty ? normalizedWarranty : null,
        itemStatus: data.itemStatus,
        itemCondition: data.itemCondition,
        functionalStatus: data.functionalStatus,
        notes: data.notes,
      });
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Edit Asset Item</DialogTitle>
          <DialogDescription>
            Update serial, status, condition, location, or notes for this asset item.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Tag</Label>
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm font-mono">
              {assetItem?.tag || "N/A"}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Asset *</Label>
              <Select value={form.watch("assetId")} onValueChange={(v) => form.setValue("assetId", v)}>
                <SelectTrigger><SelectValue placeholder="Select asset" /></SelectTrigger>
                <SelectContent>
                  {assets.map((asset) => (
                    <SelectItem key={asset.id} value={asset.id}>{asset.name}</SelectItem>
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
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.locationId && (
                <p className="text-sm text-destructive">{form.formState.errors.locationId.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="serialNumber">Serial Number</Label>
              <Input id="serialNumber" {...form.register("serialNumber")} placeholder="e.g., SN123456789" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="warrantyExpiry">Warranty Expiry</Label>
              <Input id="warrantyExpiry" type="date" {...form.register("warrantyExpiry")} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.watch("itemStatus")} onValueChange={(v) => form.setValue("itemStatus", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statusOptions.map((status) => (
                    <SelectItem key={status} value={status}>{status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Condition</Label>
              <Select value={form.watch("itemCondition")} onValueChange={(v) => form.setValue("itemCondition", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {conditionOptions.map((condition) => (
                    <SelectItem key={condition} value={condition}>{condition}</SelectItem>
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
            <Textarea id="notes" {...form.register("notes")} placeholder="Additional notes..." rows={3} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !assetItem}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
