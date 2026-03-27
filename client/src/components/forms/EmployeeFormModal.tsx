import { useEffect, useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Employee, Directorate, Location } from "@/types";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { FormDialogActions } from "@/components/forms/FormDialogActions";

const employeeSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(50),
  lastName: z.string().min(1, "Last name is required").max(50),
  email: z.string().email("Invalid email address"),
  userPassword: z.string().min(6, "Password must be at least 6 characters").optional().or(z.literal("")),
  phone: z.string().max(20).optional(),
  jobTitle: z.string().max(100).optional(),
  locationId: z.string().min(1, "Office is required"),
});

type EmployeeFormData = z.infer<typeof employeeSchema>;

interface EmployeeFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee?: Employee | null;
  directorates: Directorate[];
  locations: Location[];
  locationLocked?: boolean;
  fixedLocationId?: string | null;
  onSubmit: (data: EmployeeFormData & { defaultSubLocationId?: string | null; allowedSubLocationIds?: string[] }) => Promise<void>;
}

export function EmployeeFormModal({
  open,
  onOpenChange,
  employee,
  directorates: _directorates,
  locations,
  fixedLocationId,
  onSubmit,
}: EmployeeFormModalProps) {
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
      locationId: employee?.location_id || fixedLocationId || "",
    },
  });

  const selectedLocationId = form.watch("locationId");
  const selectedLocation = locations.find((location) => location.id === selectedLocationId);
  const officeOptions = useMemo(
    () =>
      locations.map((office) => ({
        value: office.id,
        label: office.name,
        keywords: [office.division, office.district, office.type].filter(Boolean).join(" "),
      })),
    [locations]
  );

  useEffect(() => {
    if (!open) return;
    if (employee) {
      form.reset({
        firstName: employee.first_name,
        lastName: employee.last_name,
        email: employee.email,
        userPassword: "",
        phone: employee.phone || "",
        jobTitle: employee.job_title || "",
        locationId: fixedLocationId || employee.location_id || "",
      });
      return;
    }

    form.reset({
      firstName: "",
      lastName: "",
      email: "",
      userPassword: "",
      phone: "",
      jobTitle: "",
      locationId: fixedLocationId || "",
    });
  }, [open, employee, fixedLocationId, form]);

  useEffect(() => {
    const currentLocationId = form.getValues("locationId") || "";
    if (currentLocationId && locations.some((location) => location.id === currentLocationId)) {
      return;
    }
    if (fixedLocationId && locations.some((location) => location.id === fixedLocationId)) {
      form.setValue("locationId", fixedLocationId, { shouldValidate: true });
      return;
    }
    if (!currentLocationId && locations[0]) {
      form.setValue("locationId", locations[0].id, { shouldValidate: true });
    }
  }, [locations, fixedLocationId, form]);

  const handleSubmit = async (data: EmployeeFormData) => {
    setIsSubmitting(true);
    try {
      if (!isEditing && !data.userPassword) {
        form.setError("userPassword", { message: "Initial password is required" });
        return;
      }

      await onSubmit({
        ...data,
        userPassword: data.userPassword || undefined,
        locationId: fixedLocationId || data.locationId,
        defaultSubLocationId: null,
        allowedSubLocationIds: [],
      });
      form.reset();
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
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
              <Label htmlFor="userPassword">Initial Password *</Label>
              <Input
                id="userPassword"
                type="password"
                {...form.register("userPassword")}
                autoComplete="new-password"
                placeholder="Enter initial password"
              />
              {form.formState.errors.userPassword && (
                <p className="text-sm text-destructive">{form.formState.errors.userPassword.message}</p>
              )}
              <p className="text-xs text-muted-foreground">Set the employee's initial password during creation.</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" {...form.register("phone")} placeholder="+92 300 1234567" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="jobTitle">Designation</Label>
              <Input id="jobTitle" {...form.register("jobTitle")} placeholder="Designation" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="employee-office">Office *</Label>
            <SearchableSelect
              id="employee-office"
              value={selectedLocationId || ""}
              onValueChange={(value) => form.setValue("locationId", value, { shouldValidate: true })}
              disabled={Boolean(fixedLocationId)}
              placeholder="Search office..."
              searchPlaceholder="Search offices, labs, and directorates..."
              emptyText="No offices found."
              options={officeOptions}
            />
            {selectedLocation && (
              <p className="text-xs text-muted-foreground">
                {[selectedLocation.division, selectedLocation.district, selectedLocation.type]
                  .filter(Boolean)
                  .join(" • ")}
              </p>
            )}
            {form.formState.errors.locationId && (
              <p className="text-sm text-destructive">{form.formState.errors.locationId.message}</p>
            )}
          </div>

          <FormDialogActions
            isSubmitting={isSubmitting}
            onCancel={() => onOpenChange(false)}
            submitLabel={isEditing ? "Update" : "Create"}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}
