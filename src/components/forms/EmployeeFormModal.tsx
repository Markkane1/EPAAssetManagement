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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { Employee, Directorate, Location } from "@/types";
import { isHeadOfficeLocation } from "@/lib/locationUtils";

const employeeSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(50),
  lastName: z.string().min(1, "Last name is required").max(50),
  email: z.string().email("Invalid email address"),
  userPassword: z.string().min(6, "Password must be at least 6 characters").optional().or(z.literal("")),
  phone: z.string().max(20).optional(),
  jobTitle: z.string().max(100).optional(),
  directorateId: z.string().optional(),
  locationId: z.string().min(1, "Office is required"),
});

type EmployeeFormData = z.infer<typeof employeeSchema>;

interface EmployeeFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee?: Employee | null;
  directorates: Directorate[];
  locations: Location[];
  onSubmit: (data: EmployeeFormData) => Promise<void>;
}

export function EmployeeFormModal({ open, onOpenChange, employee, directorates, locations, onSubmit }: EmployeeFormModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = !!employee;

  const form = useForm<EmployeeFormData>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      firstName: employee?.first_name || "",
      lastName: employee?.last_name || "",
      email: employee?.email || "",
      userPassword: "",
      phone: employee?.phone || "",
      jobTitle: employee?.job_title || "",
      directorateId: employee?.directorate_id || "",
      locationId: employee?.location_id || "",
    },
  });

  const selectedLocationId = form.watch("locationId");
  const selectedDirectorateId = form.watch("directorateId");
  const selectedLocation = locations.find((loc) => loc.id === selectedLocationId);
  const isHeadOffice = isHeadOfficeLocation(selectedLocation);

  useEffect(() => {
    if (employee) {
      form.reset({
        firstName: employee.first_name,
        lastName: employee.last_name,
        email: employee.email,
        userPassword: "",
        phone: employee.phone || "",
        jobTitle: employee.job_title || "",
        directorateId: employee.directorate_id || "",
        locationId: employee.location_id || "",
      });
    } else {
      form.reset({
        firstName: "",
        lastName: "",
        email: "",
        userPassword: "",
        phone: "",
        jobTitle: "",
        directorateId: "",
        locationId: "",
      });
    }
  }, [employee, form]);

  useEffect(() => {
    if (!isHeadOffice && selectedDirectorateId) {
      form.setValue("directorateId", "");
    }
    if (!isHeadOffice) {
      form.clearErrors("directorateId");
    }
  }, [isHeadOffice, selectedDirectorateId, form]);

  const handleSubmit = async (data: EmployeeFormData) => {
    setIsSubmitting(true);
    try {
      if (isHeadOffice && !data.directorateId) {
        form.setError("directorateId", { message: "Division is required for Head Office" });
        return;
      }

      const payload = {
        ...data,
        userPassword: data.userPassword ? data.userPassword : undefined,
        directorateId: isHeadOffice ? data.directorateId : undefined,
      };

      await onSubmit(payload);
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
          <DialogTitle>{isEditing ? "Edit Employee" : "Add Employee"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update employee details below." : "Add a new employee to the organization."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name *</Label>
              <Input id="firstName" {...form.register("firstName")} placeholder="John" />
              {form.formState.errors.firstName && (
                <p className="text-sm text-destructive">{form.formState.errors.firstName.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name *</Label>
              <Input id="lastName" {...form.register("lastName")} placeholder="Doe" />
              {form.formState.errors.lastName && (
                <p className="text-sm text-destructive">{form.formState.errors.lastName.message}</p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input id="email" type="email" {...form.register("email")} placeholder="john@EPAPunjab.gov.pk" />
            {form.formState.errors.email && (
              <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
            )}
          </div>
          {!isEditing && (
            <div className="space-y-2">
              <Label htmlFor="userPassword">Initial Password (optional)</Label>
              <Input
                id="userPassword"
                type="password"
                {...form.register("userPassword")}
                placeholder="Leave blank to auto-generate"
              />
              {form.formState.errors.userPassword && (
                <p className="text-sm text-destructive">{form.formState.errors.userPassword.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                A temporary password will be generated if left blank.
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" {...form.register("phone")} placeholder="+92 300 1234567" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="jobTitle">Job Title</Label>
              <Input id="jobTitle" {...form.register("jobTitle")} placeholder="Software Engineer" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Division *</Label>
              <Select
                value={form.watch("directorateId") || ""}
                onValueChange={(v) => form.setValue("directorateId", v)}
                disabled={!isHeadOffice}
              >
                <SelectTrigger><SelectValue placeholder={isHeadOffice ? "Select division" : "Head Office only"} /></SelectTrigger>
                <SelectContent>
                  {directorates.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isHeadOffice && form.formState.errors.directorateId && (
                <p className="text-sm text-destructive">{form.formState.errors.directorateId.message}</p>
              )}
              {!isHeadOffice && (
                <p className="text-xs text-muted-foreground">Divisions apply to Head Office only.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Office *</Label>
              <Select value={form.watch("locationId")} onValueChange={(v) => form.setValue("locationId", v)}>
                <SelectTrigger><SelectValue placeholder="Select office" /></SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.locationId && (
                <p className="text-sm text-destructive">{form.formState.errors.locationId.message}</p>
              )}
            </div>
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
