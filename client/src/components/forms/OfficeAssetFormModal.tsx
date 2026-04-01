import { useMemo, useState, useEffect } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
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
import { Asset, Category, PurchaseOrder, Vendor } from "@/types";
import { FormDialogActions } from "@/components/forms/FormDialogActions";
import { getFormEntityId } from "@/components/forms/formEntityUtils";
import { useDialogFormReset } from "@/components/forms/useDialogFormReset";
import { usePdfAttachmentField } from "@/components/forms/usePdfAttachmentField";
import { Button } from "@/components/ui/button";
import { PurchaseOrderFormModal } from "@/components/forms/PurchaseOrderFormModal";
import { useCreatePurchaseOrder, usePurchaseOrders } from "@/hooks/usePurchaseOrders";

const optionalDimension = z.preprocess(
    (value) => {
        if (value === "" || value === null || value === undefined) return undefined;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : value;
    },
    z.number().min(0, "Dimension must be 0 or greater").optional()
);

const assetSchema = z.object({
    name: z.string().min(1, "Name is required").max(100),
    description: z.string().max(500).optional(),
    specification: z.string().min(1, "Specification is required").max(5000),
    categoryId: z.string().min(1, "Category is required"),
    subcategory: z.string().optional(),
    assetSource: z.literal("procurement"),
    vendorId: z.string().min(1, "Vendor is required for procurement"),
    purchaseOrderId: z.string().optional(),
    price: z.coerce.number().min(0, "Price must be positive"),
    acquisitionDate: z.string().min(1, "Acquisition Date is required"),
    quantity: z.coerce.number().min(1, "Quantity must be at least 1"),
    dimensionLength: optionalDimension,
    dimensionWidth: optionalDimension,
    dimensionHeight: optionalDimension,
    dimensionUnit: z.enum(["mm", "cm", "m", "in", "ft"]).default("cm"),
});

type AssetFormData = z.infer<typeof assetSchema>;
type AssetSubmitData = Omit<
    AssetFormData,
    "dimensionLength" | "dimensionWidth" | "dimensionHeight" | "dimensionUnit"
> & {
    subcategory?: string;
    dimensions: {
        length: number | null;
        width: number | null;
        height: number | null;
        unit: "mm" | "cm" | "m" | "in" | "ft";
    };
    attachmentFile?: File | null;
};

interface OfficeAssetFormModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    asset?: Asset | null;
    categories: Category[];
    vendors: Vendor[];
    onSubmit: (data: AssetSubmitData) => Promise<void>;
}

function hasDimensionValues(dimensions?: Asset["dimensions"] | null) {
    if (!dimensions) return false;
    return dimensions.length != null || dimensions.width != null || dimensions.height != null;
}

export function OfficeAssetFormModal({ open, onOpenChange, asset, categories, vendors, onSubmit }: OfficeAssetFormModalProps) {
    const NONE_VALUE = "__none__";
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showDimensions, setShowDimensions] = useState(false);
    const [isPurchaseOrderModalOpen, setIsPurchaseOrderModalOpen] = useState(false);
    const isEditing = !!asset;
    const { data: purchaseOrders } = usePurchaseOrders();
    const createPurchaseOrder = useCreatePurchaseOrder();
    const {
        attachmentFile,
        attachmentError,
        handleAttachmentChange,
        resetAttachment,
        validateAttachment,
    } = usePdfAttachmentField();

    const form = useForm<AssetFormData>({
        resolver: zodResolver(assetSchema),
        defaultValues: {
            name: asset?.name || "",
            description: asset?.description || "",
            specification: asset?.specification || "",
            categoryId: asset?.category_id || "",
            subcategory: asset?.subcategory || "",
            assetSource: "procurement",
            vendorId: asset?.vendor_id || "",
            purchaseOrderId: asset?.purchase_order_id || "",
            price: asset?.unit_price || undefined,
            acquisitionDate: asset?.acquisition_date
                ? new Date(asset.acquisition_date).toISOString().split("T")[0]
                : "",
            quantity: asset?.quantity || 1,
            dimensionLength: asset?.dimensions?.length ?? undefined,
            dimensionWidth: asset?.dimensions?.width ?? undefined,
            dimensionHeight: asset?.dimensions?.height ?? undefined,
            dimensionUnit: asset?.dimensions?.unit || "cm",
        },
    });

    const resetValues = useMemo(() => {
        if (asset) {
            return {
                name: asset.name,
                description: asset.description || "",
                specification: asset.specification || "",
                categoryId: asset.category_id || "",
                subcategory: asset.subcategory || "",
                assetSource: "procurement" as const,
                vendorId: asset.vendor_id || "",
                purchaseOrderId: asset.purchase_order_id || "",
                price: asset.unit_price || undefined,
                acquisitionDate: asset.acquisition_date
                    ? new Date(asset.acquisition_date).toISOString().split("T")[0]
                    : "",
                quantity: asset.quantity || 1,
                dimensionLength: asset.dimensions?.length ?? undefined,
                dimensionWidth: asset.dimensions?.width ?? undefined,
                dimensionHeight: asset.dimensions?.height ?? undefined,
                dimensionUnit: asset.dimensions?.unit || "cm",
            };
        }

        return {
            name: "",
            description: "",
            specification: "",
            categoryId: "",
            subcategory: "",
            assetSource: "procurement" as const,
            vendorId: "",
            purchaseOrderId: "",
            price: undefined,
            acquisitionDate: new Date().toISOString().split("T")[0],
            quantity: 1,
            dimensionLength: undefined,
            dimensionWidth: undefined,
            dimensionHeight: undefined,
            dimensionUnit: "cm" as const,
        };
    }, [asset]);
    useDialogFormReset({ open, form, values: resetValues });

    useEffect(() => {
        if (!open) return;

        setShowDimensions(asset ? hasDimensionValues(asset.dimensions) : false);
        resetAttachment();
    }, [asset, open, resetAttachment]);

    const selectedCategoryId = form.watch("categoryId");
    const selectedVendorId = form.watch("vendorId");
    const selectedPrice = form.watch("price");
    const selectedQuantity = form.watch("quantity");
    const selectedCategory = useMemo(
        () => categories.find((category) => getFormEntityId(category) === selectedCategoryId) || null,
        [categories, selectedCategoryId]
    );
    const availableSubcategories = useMemo(
        () => selectedCategory?.subcategories || [],
        [selectedCategory]
    );
    const purchaseOrderList = useMemo(
        () => (purchaseOrders || []).filter((order) => order.source_type === "procurement"),
        [purchaseOrders]
    );
    const accessibleVendorIds = useMemo(
        () => new Set(vendors.map((vendor) => getFormEntityId(vendor)).filter(Boolean) as string[]),
        [vendors]
    );
    const visiblePurchaseOrders = useMemo(
        () =>
            purchaseOrderList.filter((order) => {
                if (order.vendor_id && !accessibleVendorIds.has(order.vendor_id)) {
                    return false;
                }
                if (selectedVendorId && order.vendor_id !== selectedVendorId) {
                    return false;
                }
                return true;
            }),
        [accessibleVendorIds, purchaseOrderList, selectedVendorId]
    );
    const purchaseOrderById = useMemo(
        () => new Map(purchaseOrderList.map((order) => [order.id, order])),
        [purchaseOrderList]
    );
    const purchaseOrderPrefill = useMemo(
        () => ({
            sourceType: "procurement" as const,
            vendorId: selectedVendorId || undefined,
            unitPrice: Number(selectedPrice || 0),
            totalAmount: Number(selectedPrice || 0) * Number(selectedQuantity || 1),
        }),
        [selectedPrice, selectedQuantity, selectedVendorId]
    );

    useEffect(() => {
        const currentSubcategory = form.getValues("subcategory") || "";
        if (!currentSubcategory) return;
        if (!availableSubcategories.includes(currentSubcategory)) {
            form.setValue("subcategory", "");
        }
    }, [availableSubcategories, form]);

    const handlePurchaseOrderSubmit = async (data: any) => {
        const createdOrder = await createPurchaseOrder.mutateAsync(data);
        setIsPurchaseOrderModalOpen(false);
        form.setValue("purchaseOrderId", createdOrder.id, { shouldDirty: true, shouldValidate: true });
        if (createdOrder.vendor_id) {
            form.setValue("vendorId", createdOrder.vendor_id, { shouldDirty: true, shouldValidate: true });
        }
        if (createdOrder.unit_price !== null && createdOrder.unit_price !== undefined) {
            form.setValue("price", createdOrder.unit_price, { shouldDirty: true, shouldValidate: true });
        }
    };

    const handlePurchaseOrderChange = (nextValue: string) => {
        const purchaseOrderId = nextValue === NONE_VALUE ? "" : nextValue;
        form.setValue("purchaseOrderId", purchaseOrderId, { shouldDirty: true, shouldValidate: true });
        const selectedOrder = purchaseOrderId ? purchaseOrderById.get(purchaseOrderId) : null;
        if (selectedOrder?.vendor_id) {
            form.setValue("vendorId", selectedOrder.vendor_id, { shouldDirty: true, shouldValidate: true });
        }
        if (selectedOrder?.unit_price !== null && selectedOrder?.unit_price !== undefined) {
            form.setValue("price", selectedOrder.unit_price, { shouldDirty: true, shouldValidate: true });
        }
    };

    const handleSubmit = async (data: AssetFormData) => {
        if (!validateAttachment()) {
            return;
        }

        setIsSubmitting(true);
        try {
            const payload: AssetSubmitData = {
                ...data,
                subcategory: data.subcategory || undefined,
                dimensions: {
                    length: showDimensions ? (data.dimensionLength ?? null) : null,
                    width: showDimensions ? (data.dimensionWidth ?? null) : null,
                    height: showDimensions ? (data.dimensionHeight ?? null) : null,
                    unit: data.dimensionUnit || "cm",
                },
                attachmentFile,
            };
            await onSubmit(payload);
            form.reset();
            setShowDimensions(false);
            resetAttachment();
            onOpenChange(false);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>{isEditing ? "Edit Procurement Asset" : "Add Procurement Asset"}</DialogTitle>
                    <DialogDescription>
                        {isEditing ? "Update procurement asset details below." : "Create a new procurement asset."}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Name *</Label>
                        <Input id="name" {...form.register("name")} placeholder="e.g., Dell Laptop XPS 15" />
                        {form.formState.errors.name && (
                            <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
                        )}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="specification">Specification *</Label>
                        <Textarea
                            id="specification"
                            {...form.register("specification")}
                            placeholder="Detailed technical specification..."
                            rows={3}
                        />
                        {form.formState.errors.specification && (
                            <p className="text-sm text-destructive">{form.formState.errors.specification.message}</p>
                        )}
                    </div>
                    <div className="flex items-center space-x-2">
                        <Checkbox
                            id="showDimensions"
                            checked={showDimensions}
                            onCheckedChange={(checked) => setShowDimensions(Boolean(checked))}
                        />
                        <Label htmlFor="showDimensions" className="text-sm font-medium">
                            Add dimensions
                        </Label>
                    </div>
                    {showDimensions ? (
                        <div className="space-y-2">
                            <Label>Dimensions</Label>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                <div className="space-y-2">
                                    <Label htmlFor="dimensionLength" className="text-xs text-muted-foreground">Length</Label>
                                    <Input id="dimensionLength" type="number" step="0.01" {...form.register("dimensionLength")} placeholder="0" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="dimensionWidth" className="text-xs text-muted-foreground">Width</Label>
                                    <Input id="dimensionWidth" type="number" step="0.01" {...form.register("dimensionWidth")} placeholder="0" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="dimensionHeight" className="text-xs text-muted-foreground">Height</Label>
                                    <Input id="dimensionHeight" type="number" step="0.01" {...form.register("dimensionHeight")} placeholder="0" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Unit</Label>
                                    <Select
                                        value={form.watch("dimensionUnit")}
                                        onValueChange={(v) => form.setValue("dimensionUnit", v as "mm" | "cm" | "m" | "in" | "ft")}
                                    >
                                        <SelectTrigger><SelectValue placeholder="Unit" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="mm">mm</SelectItem>
                                            <SelectItem value="cm">cm</SelectItem>
                                            <SelectItem value="m">m</SelectItem>
                                            <SelectItem value="in">Inches (in)</SelectItem>
                                            <SelectItem value="ft">Feet (ft)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>
                    ) : null}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Category *</Label>
                            <Select
                                value={form.watch("categoryId") || undefined}
                                onValueChange={(v) => {
                                    form.setValue("categoryId", v);
                                    form.setValue("subcategory", "");
                                }}
                            >
                                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                                <SelectContent>
                                    {categories.map((c) => {
                                        const id = getFormEntityId(c);
                                        if (!id) return null;
                                        return <SelectItem key={id} value={id}>{c.name}</SelectItem>;
                                    })}
                                </SelectContent>
                            </Select>
                            {form.formState.errors.categoryId && (
                                <p className="text-sm text-destructive">{form.formState.errors.categoryId.message}</p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label>Subcategory</Label>
                            <Select
                                value={form.watch("subcategory") || undefined}
                                onValueChange={(v) => form.setValue("subcategory", v)}
                                disabled={!selectedCategoryId || availableSubcategories.length === 0}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder={selectedCategoryId ? "Select subcategory" : "Select category first"} />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableSubcategories.length === 0 ? (
                                        <div className="p-2 text-sm text-muted-foreground text-center">No subcategories configured</div>
                                    ) : (
                                        availableSubcategories.map((subcategory) => (
                                            <SelectItem key={subcategory} value={subcategory}>{subcategory}</SelectItem>
                                        ))
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Source *</Label>
                            <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground cursor-not-allowed">
                                Procurement Only
                            </div>
                        </div>
                    </div>
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Vendor *</Label>
                                <Select
                                    value={form.watch("vendorId") || "none"}
                                    onValueChange={(v) => {
                                        const vendorId = v === "none" ? "" : v;
                                        form.setValue("vendorId", vendorId, { shouldDirty: true, shouldValidate: true });
                                        const selectedOrder = purchaseOrderById.get(form.getValues("purchaseOrderId") || "");
                                        if (selectedOrder && selectedOrder.vendor_id !== vendorId) {
                                            form.setValue("purchaseOrderId", "", { shouldDirty: true, shouldValidate: true });
                                        }
                                    }}
                                >
                                    <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Select vendor</SelectItem>
                                        {vendors.map((v) => {
                                            const id = getFormEntityId(v);
                                            if (!id) return null;
                                            return <SelectItem key={id} value={id}>{v.name}</SelectItem>;
                                        })}
                                    </SelectContent>
                                </Select>
                                {form.formState.errors.vendorId && (
                                    <p className="text-sm text-destructive">{form.formState.errors.vendorId.message}</p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="price">Unit Price (PKR) *</Label>
                                <Input id="price" type="number" step="0.01" {...form.register("price")} placeholder="0.00" />
                                {form.formState.errors.price && (
                                    <p className="text-sm text-destructive">{form.formState.errors.price.message}</p>
                                )}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-3">
                                <Label>Purchase Order</Label>
                                <Button type="button" variant="outline" size="sm" onClick={() => setIsPurchaseOrderModalOpen(true)}>
                                    New Purchase Order
                                </Button>
                            </div>
                            <Select
                                value={form.watch("purchaseOrderId") || NONE_VALUE}
                                onValueChange={handlePurchaseOrderChange}
                            >
                                <SelectTrigger><SelectValue placeholder="Link a procurement purchase order" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NONE_VALUE}>No purchase order</SelectItem>
                                    {visiblePurchaseOrders.map((order: PurchaseOrder) => (
                                        <SelectItem key={order.id} value={order.id}>
                                            {order.order_number}
                                            {order.source_name ? ` - ${order.source_name}` : ""}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                Linking a purchase order keeps this asset tied to its procurement record and syncs the vendor.
                            </p>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="assetAttachment">Invoice</Label>
                        <Input
                            id="assetAttachment"
                            type="file"
                            accept="application/pdf,.pdf"
                            onChange={handleAttachmentChange}
                        />
                        {attachmentFile ? (
                            <p className="text-xs text-muted-foreground">Selected file: {attachmentFile.name}</p>
                        ) : asset?.attachment_file_name ? (
                            <p className="text-xs text-muted-foreground">Current file: {asset.attachment_file_name}</p>
                        ) : (
                            <p className="text-xs text-muted-foreground">Upload a PDF file.</p>
                        )}
                        {attachmentError && <p className="text-sm text-destructive">{attachmentError}</p>}
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="quantity">Quantity *</Label>
                            <Input id="quantity" type="number" {...form.register("quantity")} placeholder="1" />
                            {form.formState.errors.quantity && (
                                <p className="text-sm text-destructive">{form.formState.errors.quantity.message}</p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="acquisitionDate">Acquisition Date *</Label>
                            <Input id="acquisitionDate" type="date" {...form.register("acquisitionDate")} />
                            {form.formState.errors.acquisitionDate && (
                                <p className="text-sm text-destructive">{form.formState.errors.acquisitionDate.message}</p>
                            )}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea id="description" {...form.register("description")} placeholder="Optional description..." rows={2} />
                    </div>
                    <FormDialogActions
                        isSubmitting={isSubmitting}
                        onCancel={() => onOpenChange(false)}
                        submitLabel={isEditing ? "Update" : "Create"}
                    />
                </form>
            </DialogContent>
            <PurchaseOrderFormModal
                open={isPurchaseOrderModalOpen}
                onOpenChange={setIsPurchaseOrderModalOpen}
                vendors={vendors}
                projects={[]}
                schemes={[]}
                sourceTypeLocked="procurement"
                prefill={purchaseOrderPrefill}
                onSubmit={handlePurchaseOrderSubmit}
            />
        </Dialog>
    );
}

