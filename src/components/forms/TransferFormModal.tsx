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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { AssetItem, Location, Asset } from "@/types";

const transferSchema = z.object({
  assetItemIds: z.array(z.string().min(1)).min(1, "Asset item is required"),
  fromLocationId: z.string().min(1, "Source location is required"),
  toLocationId: z.string().min(1, "Destination location is required"),
  transferDate: z.string().min(1, "Transfer date is required"),
  reason: z.string().min(1, "Reason is required").max(500),
  performedBy: z.string().min(1, "Performed by is required").max(100),
}).refine((data) => data.fromLocationId !== data.toLocationId, {
  message: "Source and destination locations must be different",
  path: ["toLocationId"],
});

type TransferFormData = z.infer<typeof transferSchema>;

interface TransferFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetItems: AssetItem[];
  locations: Location[];
  assets: Asset[];
  selectedAssetItem?: AssetItem | null;
  onSubmit: (data: TransferFormData) => Promise<void>;
}

export function TransferFormModal({
  open,
  onOpenChange,
  assetItems,
  locations,
  assets,
  selectedAssetItem,
  onSubmit,
}: TransferFormModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [itemPickerOpen, setItemPickerOpen] = useState(false);

  const form = useForm<TransferFormData>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      assetItemIds: [],
      fromLocationId: "",
      toLocationId: "",
      transferDate: new Date().toISOString().split("T")[0],
      reason: "",
      performedBy: "",
    },
  });

  const selectedFromLocationId = form.watch("fromLocationId");
  const selectedAssetItemIds = form.watch("assetItemIds");
  
  // Filter asset items based on selected "from" location
  const filteredAssetItems = selectedFromLocationId 
    ? assetItems.filter((item) => item.location_id === selectedFromLocationId)
    : assetItems;

  useEffect(() => {
    if (selectedAssetItem) {
      form.setValue("assetItemIds", [selectedAssetItem.id]);
      if (selectedAssetItem.location_id) {
        form.setValue("fromLocationId", selectedAssetItem.location_id);
      }
    }
  }, [selectedAssetItem, form]);

  const handleSubmit = async (data: TransferFormData) => {
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

  // Filter out "from" location from destination options
  const availableDestinations = locations.filter((l) => l.id !== selectedFromLocationId);
  const selectedItems = filteredAssetItems.filter((item) => selectedAssetItemIds.includes(item.id));
  const quantity = selectedAssetItemIds.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Transfer Asset</DialogTitle>
          <DialogDescription>
            Move an asset item to a different location.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          {/* From Location */}
          <div className="space-y-2">
            <Label>Transfer From (Source Location) *</Label>
            <Select
              value={form.watch("fromLocationId")}
              onValueChange={(v) => {
                form.setValue("fromLocationId", v);
                form.setValue("assetItemIds", []); // Reset asset items when location changes
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select source location" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.fromLocationId && (
              <p className="text-sm text-destructive">{form.formState.errors.fromLocationId.message}</p>
            )}
          </div>

          {/* Asset Item - filtered by from location */}
          <div className="space-y-2">
            <Label>Asset Items *</Label>
            <Popover open={itemPickerOpen} onOpenChange={setItemPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between"
                  disabled={!selectedFromLocationId}
                >
                  {selectedFromLocationId
                    ? quantity > 0
                      ? `${quantity} item${quantity > 1 ? "s" : ""} selected`
                      : "Search asset items..."
                    : "Select source location first"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Type tag or asset name..." />
                  <CommandList>
                    <CommandEmpty>No assets found.</CommandEmpty>
                    {filteredAssetItems.map((item) => {
                      const isSelected = selectedAssetItemIds.includes(item.id);
                      return (
                        <CommandItem
                          key={item.id}
                          value={`${item.tag || ""} ${getAssetName(item.asset_id)}`}
                          onSelect={() => {
                            const next = isSelected
                              ? selectedAssetItemIds.filter((id) => id !== item.id)
                              : [...selectedAssetItemIds, item.id];
                            form.setValue("assetItemIds", next);
                          }}
                        >
                          <span className="font-mono">{item.tag}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{getAssetName(item.asset_id)}</span>
                          {isSelected && <span className="ml-auto text-xs text-primary">Selected</span>}
                        </CommandItem>
                      );
                    })}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {selectedItems.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="rounded-full border px-3 py-1 text-xs hover:bg-muted"
                    onClick={() =>
                      form.setValue(
                        "assetItemIds",
                        selectedAssetItemIds.filter((id) => id !== item.id)
                      )
                    }
                  >
                    {item.tag} · {getAssetName(item.asset_id)}
                  </button>
                ))}
              </div>
            )}
            {form.formState.errors.assetItemIds && (
              <p className="text-sm text-destructive">{form.formState.errors.assetItemIds.message}</p>
            )}
          </div>

          {/* To Location */}
          <div className="space-y-2">
            <Label>Transfer To (Destination Location) *</Label>
            <Select
              value={form.watch("toLocationId")}
              onValueChange={(v) => form.setValue("toLocationId", v)}
              disabled={!selectedFromLocationId}
            >
              <SelectTrigger>
                <SelectValue placeholder={selectedFromLocationId ? "Select destination location" : "Select source location first"} />
              </SelectTrigger>
              <SelectContent>
                {availableDestinations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.toLocationId && (
              <p className="text-sm text-destructive">{form.formState.errors.toLocationId.message}</p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input id="quantity" value={quantity} readOnly />
            </div>
            <div className="space-y-2">
              <Label htmlFor="transferDate">Transfer Date *</Label>
              <Input
                id="transferDate"
                type="date"
                {...form.register("transferDate")}
              />
              {form.formState.errors.transferDate && (
                <p className="text-sm text-destructive">{form.formState.errors.transferDate.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="performedBy">Performed By *</Label>
              <Input
                id="performedBy"
                {...form.register("performedBy")}
                placeholder="e.g., John Smith"
              />
              {form.formState.errors.performedBy && (
                <p className="text-sm text-destructive">{form.formState.errors.performedBy.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason *</Label>
            <Textarea
              id="reason"
              {...form.register("reason")}
              placeholder="Reason for transfer..."
              rows={2}
            />
            {form.formState.errors.reason && (
              <p className="text-sm text-destructive">{form.formState.errors.reason.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Transfer Asset
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
