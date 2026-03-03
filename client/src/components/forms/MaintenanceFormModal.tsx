import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
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
import { vendorService } from "@/services/vendorService";
import { getOfficeHolderId } from "@/lib/assetItemHolder";
import { MaintenanceRecord, MaintenanceType, MaintenanceStatus, AssetItem, Asset, Vendor } from "@/types";

const maintenanceSchema = z.object({
  assetItemId: z.string().min(1, "Asset item is required"),
  type: z.nativeEnum(MaintenanceType),
  status: z.nativeEnum(MaintenanceStatus).optional(),
  description: z.string().min(1, "Description is required").max(500),
  scheduledDate: z.string().min(1, "Scheduled date is required"),
  cost: z.coerce.number().min(0, "Cost must be positive").optional(),
  performedByVendorId: z.string().optional(),
  notes: z.string().max(500).optional(),
});

type MaintenanceFormData = z.infer<typeof maintenanceSchema>;
export type MaintenanceFormSubmitData = MaintenanceFormData & {
  performedBy?: string;
  estimateFile?: File | null;
};

interface MaintenanceFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  maintenance?: MaintenanceRecord | null;
  assetItems: AssetItem[];
  assets: Asset[];
  isEmployeeRequest?: boolean;
  onSubmit: (data: MaintenanceFormSubmitData) => Promise<void>;
}

export function MaintenanceFormModal({
  open,
  onOpenChange,
  maintenance,
  assetItems,
  assets,
  isEmployeeRequest = false,
  onSubmit,
}: MaintenanceFormModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [vendorPickerOpen, setVendorPickerOpen] = useState(false);
  const [estimateFile, setEstimateFile] = useState<File | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
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
      performedByVendorId: "",
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
        performedByVendorId: maintenance.performed_by_vendor_id || "",
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
        performedByVendorId: "",
        notes: "",
      });
    }
    setEstimateFile(null);
    setEstimateError(null);
  }, [maintenance, form]);

  const officeAssetItems = isEmployeeRequest
    ? assetItems
    : assetItems.filter((item) => Boolean(getOfficeHolderId(item)));
  const selectedAssetItem = officeAssetItems.find((item) => item.id === form.watch("assetItemId"));
  const selectedOfficeId = selectedAssetItem ? getOfficeHolderId(selectedAssetItem) : null;
  const selectedVendorId = form.watch("performedByVendorId");

  const { data: vendorsData, isLoading: vendorsLoading } = useQuery({
    queryKey: ["vendors", "maintenance-form", selectedOfficeId || "none"],
    queryFn: () => vendorService.getAll({ officeId: selectedOfficeId || undefined }),
    enabled: Boolean(selectedOfficeId),
    staleTime: 30_000,
  });
  const vendorList = useMemo(() => vendorsData || [], [vendorsData]);
  const selectedVendor = vendorList.find((vendor) => vendor.id === selectedVendorId);

  useEffect(() => {
    if (!selectedOfficeId && selectedVendorId) {
      form.setValue("performedByVendorId", "");
      return;
    }
    if (selectedVendorId && !vendorList.some((vendor) => vendor.id === selectedVendorId)) {
      form.setValue("performedByVendorId", "");
    }
  }, [form, selectedOfficeId, selectedVendorId, vendorList]);

  const handleSubmit = async (data: MaintenanceFormData) => {
    if (!isEmployeeRequest && !isEditing) {
      if (!estimateFile) {
        setEstimateError("Estimate PDF is required");
        return;
      }
      const isPdf = estimateFile.type === "application/pdf" || /\.pdf$/i.test(estimateFile.name);
      if (!isPdf) {
        setEstimateError("Estimate file must be a PDF");
        return;
      }
    }
    if (!isEmployeeRequest && !data.performedByVendorId) {
      form.setError("performedByVendorId", { message: "Performed by vendor is required" });
      return;
    }

    setIsSubmitting(true);
    try {
      const resolvedVendor = vendorList.find((vendor) => vendor.id === data.performedByVendorId);
      await onSubmit({
        ...data,
        performedByVendorId: isEmployeeRequest ? undefined : data.performedByVendorId,
        performedBy: isEmployeeRequest ? undefined : resolvedVendor?.name || "",
        estimateFile: !isEditing && !isEmployeeRequest ? estimateFile : null,
      });
      form.reset();
      setEstimateFile(null);
      setEstimateError(null);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getAssetName = (assetId: string) => {
    return assets.find((a) => a.id === assetId)?.name || "Unknown";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Maintenance" : isEmployeeRequest ? "Request Maintenance" : "Schedule Maintenance"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update maintenance record."
              : isEmployeeRequest
              ? "Submit a maintenance request for your assigned asset item."
              : "Schedule a new maintenance task."}
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
                    {officeAssetItems.map((item) => (
                      <CommandItem
                        key={item.id}
                        value={`${item.tag || ""} ${item.serial_number || ""} ${getAssetName(item.asset_id)}`}
                        onSelect={() => {
                          form.setValue("assetItemId", item.id);
                          if (!isEmployeeRequest && selectedOfficeId !== getOfficeHolderId(item)) {
                            form.setValue("performedByVendorId", "");
                          }
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

          {!isEmployeeRequest && (
            <div className="space-y-2">
              <Label>Performed By Vendor *</Label>
              <Popover open={vendorPickerOpen} onOpenChange={setVendorPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between"
                    disabled={!selectedOfficeId}
                  >
                    {selectedVendor
                      ? selectedVendor.name
                      : selectedOfficeId
                      ? "Search office vendors..."
                      : "Select office-held asset item first"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search vendor by name, email, phone..." />
                    <CommandList>
                      <CommandEmpty>
                        {vendorsLoading ? "Loading vendors..." : "No vendors found for selected office."}
                      </CommandEmpty>
                      {vendorList.map((vendor: Vendor) => (
                        <CommandItem
                          key={vendor.id}
                          value={`${vendor.name || ""} ${vendor.email || ""} ${vendor.phone || ""}`}
                          onSelect={() => {
                            form.setValue("performedByVendorId", vendor.id);
                            setVendorPickerOpen(false);
                          }}
                        >
                          <span>{vendor.name}</span>
                          {vendor.phone ? (
                            <span className="ml-2 text-xs text-muted-foreground">{vendor.phone}</span>
                          ) : null}
                        </CommandItem>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {form.formState.errors.performedByVendorId && (
                <p className="text-sm text-destructive">{form.formState.errors.performedByVendorId.message}</p>
              )}
            </div>
          )}

          {!isEditing && !isEmployeeRequest && (
            <div className="space-y-2">
              <Label htmlFor="estimateFile">Estimate (PDF) *</Label>
              <Input
                id="estimateFile"
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  setEstimateFile(file);
                  setEstimateError(null);
                }}
              />
              {estimateError && <p className="text-sm text-destructive">{estimateError}</p>}
            </div>
          )}

          {isEditing && !maintenance?.estimate_document_id ? (
            <p className="text-xs text-warning">
              This legacy record has no estimate document linked.
            </p>
          ) : null}

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
              {isEditing ? "Update" : isEmployeeRequest ? "Submit Request" : "Schedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
