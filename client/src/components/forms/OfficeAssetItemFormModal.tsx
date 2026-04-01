import { useMemo, useState, useEffect, useRef } from "react";
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Asset, Location } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { FormDialogActions } from "@/components/forms/FormDialogActions";
import { useDialogFormReset } from "@/components/forms/useDialogFormReset";
import { useAssetOptions, useEntityById } from "@/components/forms/useFormSearchLookups";
import {
    assetItemConditionOptions,
    assetItemFunctionalStatusOptions,
    assetItemPrimaryStatusOptions,
    getAllowedAssetStates,
    getDefaultAssetState,
    getFunctionalStatusHelperText,
} from "@/lib/assetItemStatusRules";

const assetItemSchema = z.object({
    assetId: z.string().min(1, "Asset is required"),
    locationId: z.string().min(1, "Location is required"),
    itemStatus: z.string().default("Available"),
    itemCondition: z.string().default("New"),
    functionalStatus: z.string().default("Functional"),
    notes: z.string().max(500).optional(),
});

type AssetItemFormData = z.infer<typeof assetItemSchema>;

interface OfficeAssetItemFormModalProps {
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

export function OfficeAssetItemFormModal({ open, onOpenChange, assets, locations, onSubmit }: OfficeAssetItemFormModalProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { locationId: authLocationId } = useAuth();
    const serialInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

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

    const resetValues = useMemo(() => ({
        assetId: "",
        locationId: authLocationId || "",
        itemStatus: "Available",
        itemCondition: "New",
        functionalStatus: "Functional",
        notes: "",
    }), [authLocationId]);
    useDialogFormReset({ open, form, values: resetValues });

    const [items, setItems] = useState<Array<{ id: string; serialNumber: string; warrantyExpiry?: string }>>([
        { id: crypto.randomUUID(), serialNumber: "", warrantyExpiry: "" },
    ]);
    const [itemsError, setItemsError] = useState<string | null>(null);
    const selectedAssetId = form.watch("assetId");
    const getAssetById = useEntityById(assets);
    const selectedAsset = getAssetById(selectedAssetId);
    const assetQuantity = selectedAsset?.quantity || 0;
    const assetOptions = useAssetOptions(assets);
    const functionalStatus = form.watch("functionalStatus");
    const itemStatus = form.watch("itemStatus");

    useEffect(() => {
        const allowedStates = getAllowedAssetStates(functionalStatus);
        if (!allowedStates.includes(itemStatus as (typeof allowedStates)[number])) {
            form.setValue("itemStatus", getDefaultAssetState(functionalStatus), { shouldDirty: true });
        }
    }, [functionalStatus, itemStatus, form]);

    useEffect(() => {
        if (!open) return;
        setItems([{ id: crypto.randomUUID(), serialNumber: "", warrantyExpiry: "" }]);
        setItemsError(null);
    }, [open]);

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

    const userLocationName = locations.find(l => l.id === authLocationId)?.name || 'Processing...';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px]">
                <DialogHeader>
                    <DialogTitle>Add Office Asset Item</DialogTitle>
                    <DialogDescription>
                        Register a new individual asset item to your office.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Asset *</Label>
                            <Select value={form.watch("assetId")} onValueChange={(v) => form.setValue("assetId", v)}>
                                <SelectTrigger><SelectValue placeholder="Select asset" /></SelectTrigger>
                                <SelectContent>
                                    {assetOptions.map((asset) => (
                                        <SelectItem key={asset.value} value={asset.value}>
                                            {asset.secondaryText ? `${asset.primaryText} - ${asset.secondaryText}` : asset.primaryText}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {form.formState.errors.assetId && (
                                <p className="text-sm text-destructive">{form.formState.errors.assetId.message}</p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label>Office *</Label>
                            <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground cursor-not-allowed">
                                {userLocationName}
                            </div>
                            {form.formState.errors.locationId && (
                                <p className="text-sm text-destructive">{form.formState.errors.locationId.message}</p>
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
                    />
                </form>
            </DialogContent>
        </Dialog>
    );
}

