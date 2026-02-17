import { useState, useEffect, type ChangeEvent } from "react";
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
import { Loader2 } from "lucide-react";
import { Asset, Category, Project, Scheme, Vendor } from "@/types";

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
  assetSource: z.enum(["procurement", "project"]),
  vendorId: z.string().optional(),
  projectId: z.string().optional(),
  schemeId: z.string().optional(),
  price: z.coerce.number().min(0, "Price must be positive").optional(),
  acquisitionDate: z.string().min(1, "Acquisition Date is required"),
  quantity: z.coerce.number().min(1, "Quantity must be at least 1"),
  dimensionLength: optionalDimension,
  dimensionWidth: optionalDimension,
  dimensionHeight: optionalDimension,
  dimensionUnit: z.enum(["mm", "cm", "m", "in", "ft"]).default("cm"),
}).superRefine((data, ctx) => {
  if (data.assetSource === "procurement") {
    if (!data.vendorId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["vendorId"],
        message: "Vendor is required for procurement",
      });
    }
    if (data.price === undefined || Number.isNaN(data.price)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["price"],
        message: "Price is required for procurement",
      });
    }
  }

  if (data.assetSource === "project") {
    if (!data.projectId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["projectId"],
        message: "Project is required for project handover",
      });
    }
    if (!data.schemeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["schemeId"],
        message: "Scheme is required for project handover",
      });
    }
  }
});

type AssetFormData = z.infer<typeof assetSchema>;
type AssetSubmitData = Omit<
  AssetFormData,
  "dimensionLength" | "dimensionWidth" | "dimensionHeight" | "dimensionUnit"
> & {
  dimensions: {
    length: number | null;
    width: number | null;
    height: number | null;
    unit: "mm" | "cm" | "m" | "in" | "ft";
  };
  attachmentFile?: File | null;
};

interface AssetFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset?: Asset | null;
  categories: Category[];
  vendors: Vendor[];
  projects: Project[];
  schemes: Scheme[];
  onSubmit: (data: AssetSubmitData) => Promise<void>;
}

function hasDimensionValues(dimensions?: Asset["dimensions"] | null) {
  if (!dimensions) return false;
  return dimensions.length != null || dimensions.width != null || dimensions.height != null;
}

function getEntityId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const record = value as { id?: unknown; _id?: unknown; toString?: () => string };
    if (typeof record.id === "string") return record.id;
    if (typeof record._id === "string") return record._id;
    if (record._id && typeof record._id === "object" && "toString" in (record._id as object)) {
      const parsed = String(record._id);
      if (parsed && parsed !== "[object Object]") return parsed;
    }
    if (typeof record.toString === "function") {
      const parsed = record.toString();
      if (parsed && parsed !== "[object Object]") return parsed;
    }
  }
  return "";
}

function isPdfAttachment(file: File) {
  if (file.type === "application/pdf") return true;
  return /\.pdf$/i.test(file.name);
}

export function AssetFormModal({ open, onOpenChange, asset, categories, vendors, projects, schemes, onSubmit }: AssetFormModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDimensions, setShowDimensions] = useState(false);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const isEditing = !!asset;

  const form = useForm<AssetFormData>({
    resolver: zodResolver(assetSchema),
    defaultValues: {
      name: asset?.name || "",
      description: asset?.description || "",
      specification: asset?.specification || "",
      categoryId: asset?.category_id || "",
      assetSource: asset?.asset_source || (asset?.project_id ? "project" : "procurement"),
      vendorId: asset?.vendor_id || "",
      projectId: asset?.project_id || "",
      schemeId: asset?.scheme_id || "",
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

  useEffect(() => {
    if (!open) return;

    if (asset) {
      form.reset({
        name: asset.name,
        description: asset.description || "",
        specification: asset.specification || "",
        categoryId: asset.category_id || "",
        assetSource: asset.asset_source || (asset.project_id ? "project" : "procurement"),
        vendorId: asset.vendor_id || "",
        projectId: asset.project_id || "",
        schemeId: asset.scheme_id || "",
        price: asset.unit_price || undefined,
        acquisitionDate: asset.acquisition_date
          ? new Date(asset.acquisition_date).toISOString().split("T")[0]
          : "",
        quantity: asset.quantity || 1,
        dimensionLength: asset.dimensions?.length ?? undefined,
        dimensionWidth: asset.dimensions?.width ?? undefined,
        dimensionHeight: asset.dimensions?.height ?? undefined,
        dimensionUnit: asset.dimensions?.unit || "cm",
      });
      setShowDimensions(hasDimensionValues(asset.dimensions));
      setAttachmentFile(null);
      setAttachmentError(null);
    } else {
      form.reset({
        name: "",
        description: "",
        specification: "",
        categoryId: "",
        assetSource: "procurement",
        vendorId: "",
        projectId: "",
        schemeId: "",
        price: undefined,
        acquisitionDate: "",
        quantity: 1,
        dimensionLength: undefined,
        dimensionWidth: undefined,
        dimensionHeight: undefined,
        dimensionUnit: "cm",
      });
      setShowDimensions(false);
      setAttachmentFile(null);
      setAttachmentError(null);
    }
  }, [asset, open]);

  const selectedSource = form.watch("assetSource");
  const selectedProjectId = form.watch("projectId");
  const attachmentLabel = selectedSource === "project" ? "Project Handover Documentation" : "Invoice";
  const filteredSchemes = selectedProjectId
    ? schemes.filter((scheme) => getEntityId(scheme.project_id) === selectedProjectId)
    : [];

  const handleAttachmentChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] || null;
    if (!selected) {
      setAttachmentFile(null);
      setAttachmentError(null);
      return;
    }

    if (!isPdfAttachment(selected)) {
      setAttachmentFile(null);
      setAttachmentError("Attachment must be a PDF file.");
      event.target.value = "";
      return;
    }

    setAttachmentFile(selected);
    setAttachmentError(null);
  };

  const handleSubmit = async (data: AssetFormData) => {
    if (attachmentFile && !isPdfAttachment(attachmentFile)) {
      setAttachmentError("Attachment must be a PDF file.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: AssetSubmitData = {
        ...data,
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
      setAttachmentFile(null);
      setAttachmentError(null);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Asset" : "Add Asset"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update asset details below." : "Create a new asset type."}
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
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category *</Label>
              <Select value={form.watch("categoryId") || undefined} onValueChange={(v) => form.setValue("categoryId", v)}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => {
                    const id = getEntityId(c);
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
              <Label>Source *</Label>
              <Select
                value={selectedSource}
                onValueChange={(v) => {
                  const value = v as "procurement" | "project";
                  form.setValue("assetSource", value);
                  if (value === "procurement") {
                    form.setValue("projectId", "");
                    form.setValue("schemeId", "");
                  } else {
                    form.setValue("vendorId", "");
                    form.setValue("price", undefined);
                  }
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="procurement">Procurement</SelectItem>
                  <SelectItem value="project">Project Handover</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {selectedSource === "procurement" ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Vendor *</Label>
                <Select value={form.watch("vendorId") || "none"} onValueChange={(v) => form.setValue("vendorId", v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select vendor</SelectItem>
                    {vendors.map((v) => {
                      const id = getEntityId(v);
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
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Project *</Label>
                <Select
                  value={selectedProjectId || undefined}
                  onValueChange={(v) => {
                    form.setValue("projectId", v);
                    form.setValue("schemeId", "");
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => {
                      const id = getEntityId(p);
                      if (!id) return null;
                      return <SelectItem key={id} value={id}>{p.name}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
                {form.formState.errors.projectId && (
                  <p className="text-sm text-destructive">{form.formState.errors.projectId.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Scheme *</Label>
                <Select
                  value={form.watch("schemeId") || undefined}
                  onValueChange={(v) => form.setValue("schemeId", v)}
                  disabled={!selectedProjectId}
                >
                  <SelectTrigger><SelectValue placeholder={selectedProjectId ? "Select scheme" : "Select project first"} /></SelectTrigger>
                  <SelectContent>
                    {filteredSchemes.length === 0 ? (
                      <div className="p-2 text-sm text-muted-foreground text-center">
                        No schemes found
                      </div>
                    ) : (
                      filteredSchemes.map((scheme) => {
                        const id = getEntityId(scheme);
                        if (!id) return null;
                        return <SelectItem key={id} value={id}>{scheme.name}</SelectItem>;
                      })
                    )}
                  </SelectContent>
                </Select>
                {form.formState.errors.schemeId && (
                  <p className="text-sm text-destructive">{form.formState.errors.schemeId.message}</p>
                )}
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="assetAttachment">{attachmentLabel}</Label>
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
          <div className="grid grid-cols-2 gap-4">
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
