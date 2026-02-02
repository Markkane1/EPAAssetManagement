import { useEffect } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Office } from "@/types";

const officeSchema = z.object({
  name: z.string().min(2, "Office name is required"),
  division: z.string().optional(),
  district: z.string().optional(),
  address: z.string().optional(),
  contactNumber: z.string().optional(),
});

type OfficeFormData = z.infer<typeof officeSchema>;

interface OfficeFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  office?: Office | null;
  onSubmit: (data: OfficeFormData) => Promise<void> | void;
}

export function OfficeFormModal({ open, onOpenChange, office, onSubmit }: OfficeFormModalProps) {
  const isEditing = !!office;
  const form = useForm<OfficeFormData>({
    resolver: zodResolver(officeSchema),
    defaultValues: {
      name: office?.name || "",
      division: office?.division || "",
      district: office?.district || "",
      address: office?.address || "",
      contactNumber: office?.contact_number || "",
    },
  });

  useEffect(() => {
    if (office) {
      form.reset({
        name: office.name,
        division: office.division || "",
        district: office.district || "",
        address: office.address || "",
        contactNumber: office.contact_number || "",
      });
    } else {
      form.reset({
        name: "",
        division: "",
        district: "",
        address: "",
        contactNumber: "",
      });
    }
  }, [office, form]);

  const handleSubmit = async (data: OfficeFormData) => {
    await onSubmit(data);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Office" : "Add Office"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update office details below." : "Create a new office record."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Office Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Head Office" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="division"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Division</FormLabel>
                  <FormControl>
                    <Input placeholder="Operations" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="district"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>District</FormLabel>
                  <FormControl>
                    <Input placeholder="North District" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Input placeholder="123 Main St" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="contactNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact Number</FormLabel>
                  <FormControl>
                    <Input placeholder="+233 555 000 000" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit">{isEditing ? "Update Office" : "Create Office"}</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
