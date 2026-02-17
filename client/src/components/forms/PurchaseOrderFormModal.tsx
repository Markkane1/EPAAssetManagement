import { useEffect, useMemo, useState, type ChangeEvent } from "react";
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
import { PurchaseOrder, PurchaseOrderStatus, Vendor, Project, Scheme } from "@/types";

const purchaseOrderSchema = z
  .object({
    sourceType: z.enum(["procurement", "project"]),
    sourceName: z.string().min(1, "Name of procurement / project is required").max(120),
    vendorId: z.string().optional(),
    projectId: z.string().optional(),
    schemeId: z.string().optional(),
    orderDate: z.string().min(1, "Order date is required"),
    expectedDeliveryDate: z.string().optional(),
    unitPrice: z.coerce.number().min(0, "Unit price must be positive"),
    totalAmount: z.coerce.number().min(0, "Total amount must be positive"),
    taxPercentage: z.coerce.number().min(0, "Tax percentage must be positive").max(100, "Tax percentage must be at most 100"),
    taxAmount: z.coerce.number().min(0, "Tax amount must be positive"),
    status: z.nativeEnum(PurchaseOrderStatus).optional(),
    notes: z.string().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.sourceType === "procurement" && !data.vendorId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["vendorId"],
        message: "Vendor is required for procurement purchase orders",
      });
    }

    if (data.sourceType === "project") {
      if (!data.projectId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["projectId"],
          message: "Project is required for project purchase orders",
        });
      }
      if (!data.schemeId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["schemeId"],
          message: "Scheme is required for project purchase orders",
        });
      }
    }
  });

type PurchaseOrderFormData = z.infer<typeof purchaseOrderSchema>;
type PurchaseOrderSubmitData = PurchaseOrderFormData & {
  attachmentFile?: File | null;
};

interface PurchaseOrderFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchaseOrder?: PurchaseOrder | null;
  vendors: Vendor[];
  projects: Project[];
  schemes: Scheme[];
  onSubmit: (data: PurchaseOrderSubmitData) => Promise<void>;
}

function getEntityId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const record = value as { id?: unknown; _id?: unknown; toString?: () => string };
    if (typeof record.id === "string") return record.id;
    if (typeof record._id === "string") return record._id;
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

export function PurchaseOrderFormModal({
  open,
  onOpenChange,
  purchaseOrder,
  vendors,
  projects,
  schemes,
  onSubmit,
}: PurchaseOrderFormModalProps) {
  const NONE_VALUE = "__none__";
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const isEditing = !!purchaseOrder;

  const form = useForm<PurchaseOrderFormData>({
    resolver: zodResolver(purchaseOrderSchema),
    defaultValues: {
      sourceType: "procurement",
      sourceName: "",
      vendorId: "",
      projectId: "",
      schemeId: "",
      orderDate: new Date().toISOString().split("T")[0],
      expectedDeliveryDate: "",
      unitPrice: 0,
      totalAmount: 0,
      taxPercentage: 0,
      taxAmount: 0,
      status: PurchaseOrderStatus.Draft,
      notes: "",
    },
  });

  useEffect(() => {
    if (purchaseOrder) {
      form.reset({
        sourceType: purchaseOrder.source_type || "procurement",
        sourceName: purchaseOrder.source_name || "",
        vendorId: purchaseOrder.vendor_id || "",
        projectId: purchaseOrder.project_id || "",
        schemeId: purchaseOrder.scheme_id || "",
        orderDate: new Date(purchaseOrder.order_date).toISOString().split("T")[0],
        expectedDeliveryDate: purchaseOrder.expected_delivery_date
          ? new Date(purchaseOrder.expected_delivery_date).toISOString().split("T")[0]
          : "",
        unitPrice: purchaseOrder.unit_price || 0,
        totalAmount: purchaseOrder.total_amount || 0,
        taxPercentage: purchaseOrder.tax_percentage || 0,
        taxAmount: purchaseOrder.tax_amount || 0,
        status: purchaseOrder.status || PurchaseOrderStatus.Draft,
        notes: purchaseOrder.notes || "",
      });
    } else {
      form.reset({
        sourceType: "procurement",
        sourceName: "",
        vendorId: "",
        projectId: "",
        schemeId: "",
        orderDate: new Date().toISOString().split("T")[0],
        expectedDeliveryDate: "",
        unitPrice: 0,
        totalAmount: 0,
        taxPercentage: 0,
        taxAmount: 0,
        status: PurchaseOrderStatus.Draft,
        notes: "",
      });
    }
    setAttachmentFile(null);
    setAttachmentError(null);
  }, [purchaseOrder, form]);

  const selectedSourceType = form.watch("sourceType");
  const selectedProjectId = form.watch("projectId");
  const selectedTotalAmount = form.watch("totalAmount");
  const selectedTaxPercentage = form.watch("taxPercentage");

  const filteredSchemes = useMemo(
    () => (schemes || []).filter((scheme) => getEntityId(scheme.project_id) === selectedProjectId),
    [schemes, selectedProjectId]
  );

  useEffect(() => {
    const total = Number(selectedTotalAmount || 0);
    const taxPercent = Number(selectedTaxPercentage || 0);
    const computedTax = Number.isFinite(total) && Number.isFinite(taxPercent)
      ? Number(((total * taxPercent) / 100).toFixed(2))
      : 0;
    form.setValue("taxAmount", computedTax);
  }, [selectedTotalAmount, selectedTaxPercentage, form]);

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

  const handleSubmit = async (data: PurchaseOrderFormData) => {
    if (attachmentFile && !isPdfAttachment(attachmentFile)) {
      setAttachmentError("Attachment must be a PDF file.");
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit({ ...data, attachmentFile });
      form.reset();
      setAttachmentFile(null);
      setAttachmentError(null);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Purchase Order" : "New Purchase Order"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update purchase order details." : "Create a new purchase order."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Source *</Label>
              <Select
                value={selectedSourceType}
                onValueChange={(value) => {
                  const source = value as "procurement" | "project";
                  form.setValue("sourceType", source);
                  if (source === "procurement") {
                    form.setValue("projectId", "");
                    form.setValue("schemeId", "");
                  } else {
                    form.setValue("vendorId", "");
                  }
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="procurement">Procurement</SelectItem>
                  <SelectItem value="project">Project</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sourceName">Name of Procurement / Project *</Label>
              <Input id="sourceName" {...form.register("sourceName")} placeholder="Enter source name" />
              {form.formState.errors.sourceName && (
                <p className="text-sm text-destructive">{form.formState.errors.sourceName.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {selectedSourceType === "procurement" ? (
              <>
                <div className="space-y-2">
                  <Label>Vendor *</Label>
                  <Select
                    value={form.watch("vendorId") || NONE_VALUE}
                    onValueChange={(value) => form.setValue("vendorId", value === NONE_VALUE ? "" : value)}
                  >
                    <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>Select vendor</SelectItem>
                      {vendors.map((vendor) => (
                        <SelectItem key={vendor.id} value={vendor.id}>{vendor.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.vendorId && (
                    <p className="text-sm text-destructive">{form.formState.errors.vendorId.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="attachment">Purchase Order Upload (PDF)</Label>
                  <Input
                    id="attachment"
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={handleAttachmentChange}
                  />
                  {attachmentFile ? (
                    <p className="text-xs text-muted-foreground">Selected file: {attachmentFile.name}</p>
                  ) : purchaseOrder?.attachment_file_name ? (
                    <p className="text-xs text-muted-foreground">Current file: {purchaseOrder.attachment_file_name}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Upload a PDF file (optional).</p>
                  )}
                  {attachmentError && <p className="text-sm text-destructive">{attachmentError}</p>}
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Project *</Label>
                  <Select
                    value={form.watch("projectId") || NONE_VALUE}
                    onValueChange={(value) => {
                      form.setValue("projectId", value === NONE_VALUE ? "" : value);
                      form.setValue("schemeId", "");
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>Select project</SelectItem>
                      {projects.filter((project) => project.is_active).map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.projectId && (
                    <p className="text-sm text-destructive">{form.formState.errors.projectId.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Scheme *</Label>
                  <Select
                    value={form.watch("schemeId") || NONE_VALUE}
                    onValueChange={(value) => form.setValue("schemeId", value === NONE_VALUE ? "" : value)}
                    disabled={!selectedProjectId}
                  >
                    <SelectTrigger><SelectValue placeholder={selectedProjectId ? "Select scheme" : "Select project first"} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>Select scheme</SelectItem>
                      {filteredSchemes.map((scheme) => {
                        const schemeId = getEntityId(scheme);
                        if (!schemeId) return null;
                        return (
                          <SelectItem key={schemeId} value={schemeId}>
                            {scheme.name}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.schemeId && (
                    <p className="text-sm text-destructive">{form.formState.errors.schemeId.message}</p>
                  )}
                </div>
              </>
            )}
          </div>

          {selectedSourceType === "project" && (
            <div className="space-y-2">
              <Label htmlFor="attachment">Purchase Order Upload (PDF)</Label>
              <Input
                id="attachment"
                type="file"
                accept="application/pdf,.pdf"
                onChange={handleAttachmentChange}
              />
              {attachmentFile ? (
                <p className="text-xs text-muted-foreground">Selected file: {attachmentFile.name}</p>
              ) : purchaseOrder?.attachment_file_name ? (
                <p className="text-xs text-muted-foreground">Current file: {purchaseOrder.attachment_file_name}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Upload a PDF file (optional).</p>
              )}
              {attachmentError && <p className="text-sm text-destructive">{attachmentError}</p>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="orderDate">Order Date *</Label>
              <Input id="orderDate" type="date" {...form.register("orderDate")} />
              {form.formState.errors.orderDate && (
                <p className="text-sm text-destructive">{form.formState.errors.orderDate.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="expectedDeliveryDate">Expected Delivery</Label>
              <Input id="expectedDeliveryDate" type="date" {...form.register("expectedDeliveryDate")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="unitPrice">Unit Price (PKR) *</Label>
              <Input id="unitPrice" type="number" step="0.01" {...form.register("unitPrice")} />
              {form.formState.errors.unitPrice && (
                <p className="text-sm text-destructive">{form.formState.errors.unitPrice.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="totalAmount">Total Amount (PKR) *</Label>
              <Input id="totalAmount" type="number" step="0.01" {...form.register("totalAmount")} />
              {form.formState.errors.totalAmount && (
                <p className="text-sm text-destructive">{form.formState.errors.totalAmount.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="taxPercentage">Tax Percentage (%) *</Label>
              <Input id="taxPercentage" type="number" step="0.01" {...form.register("taxPercentage")} />
              {form.formState.errors.taxPercentage && (
                <p className="text-sm text-destructive">{form.formState.errors.taxPercentage.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="taxAmount">Tax Amount (PKR) *</Label>
              <Input id="taxAmount" type="number" step="0.01" {...form.register("taxAmount")} />
              {form.formState.errors.taxAmount && (
                <p className="text-sm text-destructive">{form.formState.errors.taxAmount.message}</p>
              )}
            </div>
          </div>

          {isEditing && (
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.watch("status")}
                onValueChange={(value) => form.setValue("status", value as PurchaseOrderStatus)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.values(PurchaseOrderStatus).map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" {...form.register("notes")} placeholder="Additional notes..." rows={2} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Update" : "Create Order"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

