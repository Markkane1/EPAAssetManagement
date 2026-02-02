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
import { PurchaseOrder, PurchaseOrderStatus, Vendor, Project } from "@/types";

const purchaseOrderSchema = z.object({
  vendorId: z.string().min(1, "Vendor is required"),
  projectId: z.string().optional(),
  orderDate: z.string().min(1, "Order date is required"),
  expectedDeliveryDate: z.string().optional(),
  totalAmount: z.coerce.number().min(0, "Amount must be positive"),
  status: z.nativeEnum(PurchaseOrderStatus).optional(),
  notes: z.string().max(500).optional(),
});

type PurchaseOrderFormData = z.infer<typeof purchaseOrderSchema>;

interface PurchaseOrderFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchaseOrder?: PurchaseOrder | null;
  vendors: Vendor[];
  projects: Project[];
  onSubmit: (data: PurchaseOrderFormData) => Promise<void>;
}

export function PurchaseOrderFormModal({
  open,
  onOpenChange,
  purchaseOrder,
  vendors,
  projects,
  onSubmit,
}: PurchaseOrderFormModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = !!purchaseOrder;

  const form = useForm<PurchaseOrderFormData>({
    resolver: zodResolver(purchaseOrderSchema),
    defaultValues: {
      vendorId: "",
      projectId: "",
      orderDate: new Date().toISOString().split("T")[0],
      expectedDeliveryDate: "",
      totalAmount: 0,
      status: PurchaseOrderStatus.Draft,
      notes: "",
    },
  });

  useEffect(() => {
    if (purchaseOrder) {
      form.reset({
        vendorId: purchaseOrder.vendor_id || "",
        projectId: purchaseOrder.project_id || "",
        orderDate: new Date(purchaseOrder.order_date).toISOString().split("T")[0],
        expectedDeliveryDate: purchaseOrder.expected_delivery_date 
          ? new Date(purchaseOrder.expected_delivery_date).toISOString().split("T")[0] 
          : "",
        totalAmount: purchaseOrder.total_amount,
        status: purchaseOrder.status || PurchaseOrderStatus.Draft,
        notes: purchaseOrder.notes || "",
      });
    } else {
      form.reset({
        vendorId: "",
        projectId: "",
        orderDate: new Date().toISOString().split("T")[0],
        expectedDeliveryDate: "",
        totalAmount: 0,
        status: PurchaseOrderStatus.Draft,
        notes: "",
      });
    }
  }, [purchaseOrder, form]);

  const handleSubmit = async (data: PurchaseOrderFormData) => {
    setIsSubmitting(true);
    try {
      await onSubmit(data);
      form.reset();
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Purchase Order" : "New Purchase Order"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update purchase order details." : "Create a new purchase order."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Vendor *</Label>
              <Select
                value={form.watch("vendorId")}
                onValueChange={(v) => form.setValue("vendorId", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select vendor" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((vendor) => (
                    <SelectItem key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.vendorId && (
                <p className="text-sm text-destructive">{form.formState.errors.vendorId.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Project</Label>
              <Select
                value={form.watch("projectId") || ""}
                onValueChange={(v) => form.setValue("projectId", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {projects.filter((p) => p.is_active).map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="orderDate">Order Date *</Label>
              <Input
                id="orderDate"
                type="date"
                {...form.register("orderDate")}
              />
              {form.formState.errors.orderDate && (
                <p className="text-sm text-destructive">{form.formState.errors.orderDate.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="expectedDeliveryDate">Expected Delivery</Label>
              <Input
                id="expectedDeliveryDate"
                type="date"
                {...form.register("expectedDeliveryDate")}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="totalAmount">Total Amount *</Label>
              <Input
                id="totalAmount"
                type="number"
                step="0.01"
                {...form.register("totalAmount")}
                placeholder="0.00"
              />
              {form.formState.errors.totalAmount && (
                <p className="text-sm text-destructive">{form.formState.errors.totalAmount.message}</p>
              )}
            </div>
            {isEditing && (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={form.watch("status")}
                  onValueChange={(v) => form.setValue("status", v as PurchaseOrderStatus)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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
              {isEditing ? "Update" : "Create Order"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
