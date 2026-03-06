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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Employee, Directorate, Location } from "@/types";
import { isHeadOfficeLocation } from "@/lib/locationUtils";
import { useOfficeSubLocations } from "@/hooks/useOfficeSubLocations";

const employeeSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(50),
  lastName: z.string().min(1, "Last name is required").max(50),
  email: z.string().email("Invalid email address"),
  userPassword: z.string().min(6, "Password must be at least 6 characters").optional().or(z.literal("")),
  phone: z.string().max(20).optional(),
  jobTitle: z.string().max(100).optional(),
  directorateId: z.string().optional(),
  locationId: z.string().min(1, "Office is required"),
  defaultSubLocationId: z.string().optional(),
  allowedSubLocationIds: z.array(z.string()).default([]),
});

type EmployeeFormData = z.infer<typeof employeeSchema>;
type OfficeTypeFilter = "FIELD_OFFICE" | "LAB" | "HEAD_OFFICE";

function resolveOfficeTypeFilter(location: Location | undefined): OfficeTypeFilter {
  if (!location?.type) return "FIELD_OFFICE";
  if (location.type === "DISTRICT_LAB") return "LAB";
  if (location.type === "HEAD_OFFICE" || location.type === "DIRECTORATE") return "HEAD_OFFICE";
  return "FIELD_OFFICE";
}

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
  directorates,
  locations,
  fixedLocationId,
  onSubmit,
}: EmployeeFormModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [officePickerOpen, setOfficePickerOpen] = useState(false);
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
      locationId: employee?.location_id || fixedLocationId || "",
      defaultSubLocationId: employee?.default_sub_location_id || "",
      allowedSubLocationIds: employee?.allowed_sub_location_ids || [],
    },
  });

  const selectedLocationId = form.watch("locationId");
  const selectedDirectorateId = form.watch("directorateId");
  const selectedLocation = locations.find((loc) => loc.id === selectedLocationId);
  const { data: subLocations = [] } = useOfficeSubLocations(
    selectedLocationId ? { officeId: selectedLocationId } : undefined
  );
  const activeSubLocations = subLocations.filter((entry) => entry.is_active !== false);
  const [officeTypeFilter, setOfficeTypeFilter] = useState<OfficeTypeFilter>(
    resolveOfficeTypeFilter(selectedLocation || locations[0])
  );
  const filteredLocations = locations.filter((location) => {
    if (officeTypeFilter === "FIELD_OFFICE") return location.type === "DISTRICT_OFFICE";
    if (officeTypeFilter === "LAB") return location.type === "DISTRICT_LAB";
    return location.type === "HEAD_OFFICE" || location.type === "DIRECTORATE";
  });
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
        locationId: fixedLocationId || employee.location_id || "",
        defaultSubLocationId: employee.default_sub_location_id || "",
        allowedSubLocationIds: employee.allowed_sub_location_ids || [],
      });
      setOfficeTypeFilter(resolveOfficeTypeFilter(locations.find((loc) => loc.id === (fixedLocationId || employee.location_id || ""))));
    } else {
      form.reset({
        firstName: "",
        lastName: "",
        email: "",
        userPassword: "",
        phone: "",
        jobTitle: "",
        directorateId: "",
        locationId: fixedLocationId || "",
        defaultSubLocationId: "",
        allowedSubLocationIds: [],
      });
      setOfficeTypeFilter(resolveOfficeTypeFilter(locations.find((loc) => loc.id === (fixedLocationId || "")) || locations[0]));
    }
  }, [employee, fixedLocationId, form, locations]);

  useEffect(() => {
    if (!isHeadOffice && selectedDirectorateId) {
      form.setValue("directorateId", "");
    }
    if (!isHeadOffice) {
      form.clearErrors("directorateId");
    }
  }, [isHeadOffice, selectedDirectorateId, form]);

  useEffect(() => {
    const currentLocationId = form.getValues("locationId");
    if (!currentLocationId) return;
    if (!filteredLocations.some((location) => location.id === currentLocationId)) {
      form.setValue("locationId", "");
    }
  }, [filteredLocations, form]);

  useEffect(() => {
    const validIds = new Set(activeSubLocations.map((section) => section.id));
    const selectedAllowed = form.getValues("allowedSubLocationIds") || [];
    const nextAllowed = selectedAllowed.filter((id) => validIds.has(id));
    if (nextAllowed.length !== selectedAllowed.length) {
      form.setValue("allowedSubLocationIds", nextAllowed, { shouldValidate: true });
    }
    const defaultId = form.getValues("defaultSubLocationId");
    if (defaultId && !validIds.has(defaultId)) {
      form.setValue("defaultSubLocationId", "", { shouldValidate: true });
    }
  }, [activeSubLocations, form]);

  const handleSubmit = async (data: EmployeeFormData) => {
    setIsSubmitting(true);
    try {
      if (!isEditing && !data.userPassword) {
        form.setError("userPassword", { message: "Initial password is required" });
        return;
      }
      if (isHeadOffice && !data.directorateId) {
        form.setError("directorateId", { message: "Division is required for Head Office" });
        return;
      }

      const payload = {
        ...data,
        userPassword: data.userPassword ? data.userPassword : undefined,
        directorateId: isHeadOffice ? data.directorateId : undefined,
        locationId: fixedLocationId || data.locationId,
        defaultSubLocationId: data.defaultSubLocationId || null,
        allowedSubLocationIds: data.allowedSubLocationIds || [],
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
              <Label>Office Type *</Label>
              <Select
                value={officeTypeFilter}
                onValueChange={(value) => setOfficeTypeFilter(value as OfficeTypeFilter)}
              >
                <SelectTrigger><SelectValue placeholder="Select office type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIELD_OFFICE">Field Office</SelectItem>
                  <SelectItem value="LAB">Lab</SelectItem>
                  <SelectItem value="HEAD_OFFICE">Head Office</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Office *</Label>
            <Popover open={officePickerOpen} onOpenChange={setOfficePickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between">
                  {selectedLocation ? selectedLocation.name : "Search office..."}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Type office name..." />
                  <CommandList>
                    <CommandEmpty>No offices found.</CommandEmpty>
                    {filteredLocations.map((office) => (
                      <CommandItem
                        key={office.id}
                        value={`${office.name} ${office.division || ""} ${office.district || ""}`}
                        onSelect={() => {
                          form.setValue("locationId", office.id);
                          setOfficePickerOpen(false);
                        }}
                      >
                        <span className="font-medium">{office.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {[office.division, office.district].filter(Boolean).join(" - ")}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {form.formState.errors.locationId && (
              <p className="text-sm text-destructive">{form.formState.errors.locationId.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Allowed Room/Sections</Label>
            {activeSubLocations.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No active room/sections found for this office.
              </p>
            ) : (
              <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">
                {activeSubLocations.map((section) => {
                  const selectedIds = form.watch("allowedSubLocationIds") || [];
                  const checked = selectedIds.includes(section.id);
                  return (
                    <label key={section.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => {
                          const current = form.getValues("allowedSubLocationIds") || [];
                          if (value) {
                            if (!current.includes(section.id)) {
                              form.setValue("allowedSubLocationIds", [...current, section.id], { shouldValidate: true });
                            }
                            return;
                          }
                          const next = current.filter((id) => id !== section.id);
                          form.setValue("allowedSubLocationIds", next, { shouldValidate: true });
                          if (form.getValues("defaultSubLocationId") === section.id) {
                            form.setValue("defaultSubLocationId", "", { shouldValidate: true });
                          }
                        }}
                      />
                      <span>{section.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Employees can consume from selected room/sections only.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Default Room/Section</Label>
            <Select
              value={form.watch("defaultSubLocationId") || ""}
              onValueChange={(value) => {
                form.setValue("defaultSubLocationId", value, { shouldValidate: true });
                const selectedIds = form.getValues("allowedSubLocationIds") || [];
                if (value && !selectedIds.includes(value)) {
                  form.setValue("allowedSubLocationIds", [...selectedIds, value], { shouldValidate: true });
                }
              }}
              disabled={(form.watch("allowedSubLocationIds") || []).length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select default room/section" />
              </SelectTrigger>
              <SelectContent>
                {(form.watch("allowedSubLocationIds") || []).map((id) => {
                  const section = activeSubLocations.find((entry) => entry.id === id);
                  if (!section) return null;
                  return (
                    <SelectItem key={section.id} value={section.id}>
                      {section.name}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
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
