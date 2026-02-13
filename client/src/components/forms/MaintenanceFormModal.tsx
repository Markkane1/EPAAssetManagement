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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Loader2 } from "lucide-react";
import { MaintenanceRecord, MaintenanceType, MaintenanceStatus, AssetItem, Asset } from "@/types";

const maintenanceSchema = z.object({
  assetItemId: z.string().min(1, "Asset item is required"),
  type: z.nativeEnum(MaintenanceType),
  status: z.nativeEnum(MaintenanceStatus).optional(),
  description: z.string().min(1, "Description is required").max(500),
  scheduledDate: z.string().min(1, "Scheduled date is required"),
  cost: z.coerce.number().min(0, "Cost must be positive").optional(),
  performedBy: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
});

type MaintenanceFormData = z.infer<typeof maintenanceSchema>;

interface MaintenanceFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  maintenance?: MaintenanceRecord | null;
  assetItems: AssetItem[];
  assets: Asset[];
  onSubmit: (data: MaintenanceFormData) => Promise<void>;
}

export function MaintenanceFormModal({
  open,
  onOpenChange,
  maintenance,
  assetItems,
  assets,
  onSubmit,
}: MaintenanceFormModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const isEditing = !!maintenance;

  const form = useForm<MaintenanceFormData>({
    resolver: zodResolver(maintenanceSchema),
    defaultValues: {
      assetItemId: "",
      type: MaintenanceType.Preventive,
      status: MaintenanceStatus.Scheduled,
      description: "",
      scheduledDate: new Date().toISOString().split("T")[0],
      cost: 0,
      performedBy: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (maintenance) {
      form.reset({
        assetItemId: maintenance.asset_item_id,
        type: maintenance.maintenance_type || MaintenanceType.Preventive,
        status: maintenance.maintenance_status || MaintenanceStatus.Scheduled,
        description: maintenance.description || "",
        scheduledDate: maintenance.scheduled_date
          ? new Date(maintenance.scheduled_date).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0],
        cost: maintenance.cost || 0,
        performedBy: maintenance.performed_by || "",
        notes: maintenance.notes || "",
      });
    } else {
      form.reset({
        assetItemId: "",
        type: MaintenanceType.Preventive,
        status: MaintenanceStatus.Scheduled,
        description: "",
        scheduledDate: new Date().toISOString().split("T")[0],
        cost: 0,
        performedBy: "",
        notes: "",
      });
    }
  }, [maintenance, form]);

  const handleSubmit = async (data: MaintenanceFormData) => {
    setIsSubmitting(true);
    try {
      await onSubmit(data);
      form.reset();
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getAssetName = (assetId: string) => {
    return assets.find((a) => a.id === assetId)?.name || "Unknown";
  };

  const selectedAssetItem = assetItems.find((item) => item.id === form.watch("assetItemId"));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Maintenance" : "Schedule Maintenance"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update maintenance record." : "Schedule a new maintenance task."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Asset Item *</Label>
            <Popover open={assetPickerOpen} onOpenChange={setAssetPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between">
                  {selectedAssetItem
                    ? `${selectedAssetItem.tag || selectedAssetItem.serial_number || "Asset"} - ${getAssetName(selectedAssetItem.asset_id)}`
                    : "Search asset items..."}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search by tag, serial, or asset..." />
                  <CommandList>
                    <CommandEmpty>No asset items found.</CommandEmpty>
                    {assetItems.map((item) => (
                      <CommandItem
                        key={item.id}
                        value={`${item.tag || ""} ${item.serial_number || ""} ${getAssetName(item.asset_id)}`}
                        onSelect={() => {
                          form.setValue("assetItemId", item.id);
                          setAssetPickerOpen(false);
                        }}
                      >
                        <span className="font-mono">{item.tag || item.serial_number || "Asset"}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{getAssetName(item.asset_id)}</span>
                      </CommandItem>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {form.formState.errors.assetItemId && (
              <p className="text-sm text-destructive">{form.formState.errors.assetItemId.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type *</Label>
              <Select
                value={form.watch("type")}
                onValueChange={(v) => form.setValue("type", v as MaintenanceType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(MaintenanceType).map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isEditing && (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={form.watch("status")}
                  onValueChange={(v) => form.setValue("status", v as MaintenanceStatus)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(MaintenanceStatus).map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              {...form.register("description")}
              placeholder="Describe the maintenance work..."
              rows={2}
            />
            {form.formState.errors.description && (
              <p className="text-sm text-destructive">{form.formState.errors.description.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="scheduledDate">Scheduled Date *</Label>
              <Input
                id="scheduledDate"
                type="date"
                {...form.register("scheduledDate")}
              />
              {form.formState.errors.scheduledDate && (
                <p className="text-sm text-destructive">{form.formState.errors.scheduledDate.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cost">Estimated Cost</Label>
              <Input
                id="cost"
                type="number"
                step="0.01"
                {...form.register("cost")}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="performedBy">Performed By</Label>
            <Input
              id="performedBy"
              {...form.register("performedBy")}
              placeholder="e.g., IT Support, External Vendor"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              {...form.register("notes")}
              placeholder="Additional notes..."
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Update" : "Schedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
