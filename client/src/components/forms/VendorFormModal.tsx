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
import { Loader2 } from "lucide-react";
import { Vendor } from "@/types";

const vendorSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  contactInfo: z.string().trim().min(1, "Contact person is required").max(200),
  email: z.string().trim().min(1, "Email is required").email("Invalid email"),
  phone: z.string().trim().min(1, "Phone is required").max(20),
  address: z.string().trim().min(1, "Address is required").max(500),
});

type VendorFormData = z.infer<typeof vendorSchema>;

interface VendorFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendor?: Vendor | null;
  onSubmit: (data: VendorFormData) => Promise<void>;
}

export function VendorFormModal({ open, onOpenChange, vendor, onSubmit }: VendorFormModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = !!vendor;

  const form = useForm<VendorFormData>({
    resolver: zodResolver(vendorSchema),
    mode: "onChange",
    defaultValues: {
      name: vendor?.name || "",
      contactInfo: vendor?.contact_info || "",
      email: vendor?.email || "",
      phone: vendor?.phone || "",
      address: vendor?.address || "",
    },
  });

  useEffect(() => {
    if (vendor) {
      form.reset({
        name: vendor.name,
        contactInfo: vendor.contact_info || "",
        email: vendor.email || "",
        phone: vendor.phone || "",
        address: vendor.address || "",
      });
    } else {
      form.reset({
        name: "",
        contactInfo: "",
        email: "",
        phone: "",
        address: "",
      });
    }
  }, [vendor, form]);

  const handleSubmit = async (data: VendorFormData) => {
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
          <DialogTitle>{isEditing ? "Edit Vendor" : "Add Vendor"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update vendor details below." : "Add a new supplier/vendor."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input id="name" {...form.register("name")} placeholder="e.g., Dell Technologies" required />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="contactInfo">Contact Person *</Label>
            <Input id="contactInfo" {...form.register("contactInfo")} placeholder="John Smith" required />
            {form.formState.errors.contactInfo && (
              <p className="text-sm text-destructive">{form.formState.errors.contactInfo.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input id="email" type="email" {...form.register("email")} placeholder="contact@vendor.com" required />
              {form.formState.errors.email && (
                <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone *</Label>
              <Input id="phone" {...form.register("phone")} placeholder="+92 42 35761234" required />
              {form.formState.errors.phone && (
                <p className="text-sm text-destructive">{form.formState.errors.phone.message}</p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Address *</Label>
            <Textarea id="address" {...form.register("address")} placeholder="Full address..." rows={2} required />
            {form.formState.errors.address && (
              <p className="text-sm text-destructive">{form.formState.errors.address.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !form.formState.isValid}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
