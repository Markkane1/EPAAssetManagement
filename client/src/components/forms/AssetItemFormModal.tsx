import { useState, useEffect, useMemo, useRef } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Asset, Location } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { FormDialogActions } from "@/components/forms/FormDialogActions";
import { SearchableComboboxField } from "@/components/forms/SearchableComboboxField";
import { normalizeWhitespace } from "@/lib/textNormalization";
import {
  assetItemConditionOptions,
  assetItemFunctionalStatusOptions,
  assetItemPrimaryStatusOptions,
  getAllowedAssetStates,
  getDefaultAssetState,
  getFunctionalStatusHelperText,
} from "@/lib/assetItemStatusRules";
import {
  useAssetOptions,
  useEntityById,
  useNamedEntityOptions,
} from "@/components/forms/useFormSearchLookups";

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

export function AssetItemFormModal({ open, onOpenChange, assets, locations, onSubmit }: AssetItemFormModalProps) {
  const { isOrgAdmin, locationId: authLocationId } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const serialInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const activeLocations = useMemo(
    () => locations.filter((location) => location.is_active !== false),
    [locations]
  );
  const orgAdminDefaultLocationId = useMemo(() => {
    const headOffice = activeLocations.find((location) => location.type === "HEAD_OFFICE");
    return headOffice?.id || activeLocations[0]?.id || "";
  }, [activeLocations]);
  const defaultLocationId = isOrgAdmin ? orgAdminDefaultLocationId : authLocationId || "";

  const locationOptions = useMemo(() => {
    const officeOptions = isOrgAdmin
      ? activeLocations
      : activeLocations.filter((location) => (authLocationId ? location.id === authLocationId : false));

    return officeOptions.map((location) => ({
      id: location.id,
      name: location.name,
    }));
  }, [activeLocations, authLocationId, isOrgAdmin]);

  const form = useForm<AssetItemFormData>({
    resolver: zodResolver(assetItemSchema),
    defaultValues: {
      assetId: "",
      locationId: defaultLocationId,
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
  const selectedLocationId = form.watch("locationId");
  const getAssetById = useEntityById(assets);
  const getLocationById = useEntityById(locationOptions);
  const selectedAsset = getAssetById(selectedAssetId);
  const selectedLocation = getLocationById(selectedLocationId);
  const assetQuantity = selectedAsset?.quantity || 0;
  const assetOptions = useAssetOptions(assets);
  const officeOptions = useNamedEntityOptions(locationOptions);
  const functionalStatus = form.watch("functionalStatus");
  const itemStatus = form.watch("itemStatus");
  const canSubmit = Boolean(selectedAssetId && selectedLocationId && locationOptions.length > 0);

  useEffect(() => {
    const allowedStates = getAllowedAssetStates(functionalStatus);
    if (!allowedStates.includes(itemStatus as (typeof allowedStates)[number])) {
      form.setValue("itemStatus", getDefaultAssetState(functionalStatus), { shouldDirty: true });
    }
  }, [functionalStatus, itemStatus, form]);

  useEffect(() => {
    if (open) {
      form.reset({
        assetId: "",
        locationId: defaultLocationId,
        itemStatus: "Available",
        itemCondition: "New",
        functionalStatus: "Functional",
        notes: "",
      });
      setItems([{ id: crypto.randomUUID(), serialNumber: "", warrantyExpiry: "" }]);
      setItemsError(null);
    }
  }, [open, form, defaultLocationId]);

  useEffect(() => {
    const currentLocationId = form.getValues("locationId");
    const locationExists = locationOptions.some((location) => location.id === currentLocationId);
    if (!locationExists) {
      form.setValue("locationId", defaultLocationId);
    }
  }, [locationOptions, defaultLocationId, form]);

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
    const nextId = crypto.randomUUID();
    setItems((prev) => [...prev, { id: nextId, serialNumber: "", warrantyExpiry: "" }]);
    setTimeout(() => {
      serialInputRefs.current[nextId]?.focus();
    }, 0);
  };

  const removeRow = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px]">
        <DialogHeader>
          <DialogTitle>Add Asset Item</DialogTitle>
          <DialogDescription>
            Register a new individual asset item with unique tag and serial number.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SearchableComboboxField
              label="Asset *"
              open={assetPickerOpen}
              onOpenChange={setAssetPickerOpen}
              value={
                selectedAsset
                  ? `${normalizeWhitespace(selectedAsset.name)}${
                      selectedAsset.subcategory
                        ? ` - ${normalizeWhitespace(selectedAsset.subcategory)}`
                        : ""
                    }`
                  : undefined
              }
              options={assetOptions}
              placeholder="Search asset by name..."
              searchPlaceholder="Type asset name..."
              emptyText="No asset found."
              onValueChange={(value) => form.setValue("assetId", value)}
              error={form.formState.errors.assetId?.message}
            />
            <div className="space-y-2">
              <SearchableComboboxField
                label="Office *"
                open={locationPickerOpen}
                onOpenChange={setLocationPickerOpen}
                value={selectedLocation?.name}
                options={officeOptions}
                placeholder="Search office by name..."
                searchPlaceholder="Type office name..."
                emptyText="No location found."
                onValueChange={(value) => form.setValue("locationId", value)}
                error={form.formState.errors.locationId?.message}
                disabled={!isOrgAdmin}
              />
              {!isOrgAdmin && (
                <p className="text-xs text-muted-foreground">Only your assigned office is available.</p>
              )}
              {isOrgAdmin && locationOptions.length === 0 && (
                <p className="text-xs text-destructive">Create an active office before adding asset items.</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Asset State</Label>
              <Select value={form.watch("itemStatus")} onValueChange={(v) => form.setValue("itemStatus", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {assetItemPrimaryStatusOptions.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Main operational state for this item.</p>
            </div>
            <div className="space-y-2">
              <Label>Condition</Label>
              <Select value={form.watch("itemCondition")} onValueChange={(v) => form.setValue("itemCondition", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {assetItemConditionOptions.map((c) => (
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
                  {assetItemFunctionalStatusOptions.map((status) => (
                    <SelectItem key={status} value={status}>{status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{getFunctionalStatusHelperText(functionalStatus)}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" {...form.register("notes")} placeholder="Additional notes..." rows={2} />
          </div>

          <div className="space-y-2">
            <Label>Items *</Label>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2">Serial Number</th>
                    <th className="text-left px-3 py-2">Warranty Expiry</th>
                    <th className="w-[60px] px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-t" onClick={() => serialInputRefs.current[item.id]?.focus()}>
                      <td className="px-3 py-2">
                        <Input
                          ref={(node) => {
                            serialInputRefs.current[item.id] = node;
                          }}
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

          <FormDialogActions
            isSubmitting={isSubmitting}
            onCancel={() => onOpenChange(false)}
            submitLabel="Create Item"
            disableSubmit={!canSubmit}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

