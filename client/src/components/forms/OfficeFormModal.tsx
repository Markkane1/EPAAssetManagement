import { useEffect } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Office, Division, District, OfficeType } from "@/types";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { FormDialogActions } from "@/components/forms/FormDialogActions";

const OFFICE_TYPE_OPTIONS: Array<{ value: OfficeType; label: string }> = [
  { value: "HEAD_OFFICE", label: "Head Office" },
  { value: "DIRECTORATE", label: "Directorate" },
  { value: "DISTRICT_OFFICE", label: "District Office" },
  { value: "DISTRICT_LAB", label: "District Lab" },
];

// Accepts Pakistani mobile and landline formats in local or international style.
const PAKISTAN_PHONE_REGEX = /^(?:\+92|0)(?:3\d{9}|[1-9]\d{1,2}\d{6,8})$/;

function sanitizePhoneInput(value: string) {
  return value.replace(/[^\d+\-\s]/g, "");
}

function normalizePhoneForValidation(value: string) {
  return value.replace(/[\s-]/g, "");
}

function normalizePhoneForSubmit(value?: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return undefined;
  return normalizePhoneForValidation(trimmed);
}

function coerceOfficeType(value?: string | null): OfficeType {
  if (value === "HEAD_OFFICE" || value === "DIRECTORATE" || value === "DISTRICT_OFFICE" || value === "DISTRICT_LAB") {
    return value;
  }
  return "DISTRICT_OFFICE";
}

const officeSchema = z.object({
  name: z.string().min(2, "Office name is required"),
  division: z.string().min(1, "Division is required"),
  district: z.string().min(1, "District is required"),
  address: z.string().min(1, "Address is required"),
  contactNumber: z
    .string()
    .min(1, "Contact number is required")
    .refine((value) => {
      const normalized = normalizePhoneForValidation(String(value || "").trim());
      return !normalized || PAKISTAN_PHONE_REGEX.test(normalized);
    }, "Use Pakistani format, e.g. 03001234567 or +923001234567"),
  type: z.enum(["HEAD_OFFICE", "DIRECTORATE", "DISTRICT_OFFICE", "DISTRICT_LAB"]),
  capabilities: z
    .object({
      moveables: z.boolean().optional(),
      consumables: z.boolean().optional(),
      chemicals: z.boolean().optional(),
    })
    .optional(),
});

type OfficeFormData = z.infer<typeof officeSchema>;
interface OfficeFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  office?: Office | null;
  divisions?: Division[];
  districts?: District[];
  defaultType?: OfficeType;
  onSubmit: (data: OfficeFormData) => Promise<void> | void;
}

export function OfficeFormModal({
  open,
  onOpenChange,
  office,
  divisions = [],
  districts = [],
  defaultType = "DISTRICT_OFFICE",
  onSubmit,
}: OfficeFormModalProps) {
  const isEditing = !!office;
  const form = useForm<OfficeFormData>({
    resolver: zodResolver(officeSchema),
    defaultValues: {
      name: office?.name || "",
      division: office?.division || "",
      district: office?.district || "",
      address: office?.address || "",
      contactNumber: office?.contact_number || "",
      type: office ? coerceOfficeType(office?.type) : defaultType,
      capabilities: {
        moveables: office?.capabilities?.moveables ?? true,
        consumables: office?.capabilities?.consumables ?? true,
        chemicals:
          office?.capabilities?.chemicals ??
          ((office ? coerceOfficeType(office?.type) : defaultType) === "DISTRICT_LAB"),
      },
    },
  });

  useEffect(() => {
    if (!open) return;
    if (office) {
      form.reset({
        name: office.name,
        division: office.division || "",
        district: office.district || "",
        address: office.address || "",
        contactNumber: office.contact_number || "",
        type: coerceOfficeType(office.type),
        capabilities: {
          moveables: office.capabilities?.moveables ?? true,
          consumables: office.capabilities?.consumables ?? true,
          chemicals: office.capabilities?.chemicals ?? (coerceOfficeType(office.type) === "DISTRICT_LAB"),
        },
      });
    } else {
      form.reset({
        name: "",
        division: "",
        district: "",
        address: "",
        contactNumber: "",
        type: defaultType,
        capabilities: {
          moveables: true,
          consumables: true,
          chemicals: defaultType === "DISTRICT_LAB",
        },
      });
    }
  }, [open, office, form, defaultType]);

  const handleSubmit = async (data: OfficeFormData) => {
    await onSubmit({
      ...data,
      division: data.division.trim(),
      district: data.district.trim(),
      address: data.address.trim(),
      contactNumber: normalizePhoneForSubmit(data.contactNumber),
    });
    onOpenChange(false);
  };

  const activeDivisions = divisions.filter((division) => division.is_active !== false);
  const activeDistricts = districts.filter((district) => district.is_active !== false);
  const selectedType = form.watch("type");

  const selectedDivisionName = form.watch("division");
  const selectedDivision = activeDivisions.find((division) => division.name === selectedDivisionName);
  const filteredDistricts = selectedDivision
    ? activeDistricts.filter((district) => String(district.division_id || "") === selectedDivision.id)
    : activeDistricts;

  const divisionOptions = Array.from(
    new Map(
      [
        ...activeDivisions.map((division) => [division.name, division]),
        ...(office?.division ? [[office.division, { id: office.division, name: office.division } as Division]] : []),
      ].filter(([name]) => name && name.trim())
    ).values()
  );

  const districtOptions = Array.from(
    new Map(
      [
        ...filteredDistricts.map((district) => [district.name, district]),
        ...(office?.district ? [[office.district, { id: office.district, name: office.district, division_id: null } as District]] : []),
      ].filter(([name]) => name && name.trim())
    ).values()
  );

  useEffect(() => {
    const currentDistrict = form.getValues("district");
    if (!currentDistrict) return;
    if (selectedDivision && !filteredDistricts.some((d) => d.name === currentDistrict)) {
      form.setValue("district", "");
    }
  }, [selectedDivisionName, filteredDistricts, form, selectedDivision]);

  useEffect(() => {
    const nextChemicals = selectedType === "DISTRICT_LAB";
    const currentCapabilities = form.getValues("capabilities") || {};
    if (currentCapabilities.chemicals !== nextChemicals) {
      form.setValue(
        "capabilities",
        {
          ...currentCapabilities,
          chemicals: nextChemicals,
        },
        { shouldDirty: false, shouldValidate: false }
      );
    }
  }, [selectedType, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
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
                  <FormLabel>Division *</FormLabel>
                  <FormControl>
                    <SearchableSelect
                      value={field.value || ""}
                      onValueChange={field.onChange}
                      placeholder="Select division"
                      searchPlaceholder="Search divisions..."
                      emptyText="No divisions found."
                      options={divisionOptions.map((division) => ({
                        value: division.name,
                        label: division.name,
                      }))}
                    />
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
                  <FormLabel>District *</FormLabel>
                  <FormControl>
                    <SearchableSelect
                      value={field.value || ""}
                      onValueChange={field.onChange}
                      placeholder="Select district"
                      searchPlaceholder="Search districts..."
                      emptyText="No districts found."
                      options={districtOptions.map((district) => ({
                        value: district.name,
                        label: district.name,
                      }))}
                    />
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
                  <FormLabel>Address *</FormLabel>
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
                  <FormLabel>Contact Number *</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="tel"
                      inputMode="tel"
                      placeholder="03001234567 or +923001234567"
                      value={field.value || ""}
                      onChange={(event) => field.onChange(sanitizePhoneInput(event.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="space-y-2">
              <div className="space-y-2">
                <FormLabel>Office Type</FormLabel>
                <Select
                  value={form.watch("type") || "DISTRICT_OFFICE"}
                  onValueChange={(value) =>
                    form.setValue("type", value as OfficeType, { shouldDirty: true, shouldValidate: true })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {OFFICE_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {selectedType === "DIRECTORATE" && (
              <p className="text-xs text-muted-foreground">
                Directorates are automatically linked to the single active Head Office.
              </p>
            )}
            {selectedType === "HEAD_OFFICE" && (
              <p className="text-xs text-muted-foreground">
                Only one active Head Office is allowed in the system.
              </p>
            )}
            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={form.watch("capabilities")?.moveables ?? true}
                  onCheckedChange={(checked) =>
                    form.setValue("capabilities", {
                      ...form.getValues("capabilities"),
                      moveables: Boolean(checked),
                    })
                  }
                />
                <FormLabel>Moveables</FormLabel>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={form.watch("capabilities")?.consumables ?? true}
                  onCheckedChange={(checked) =>
                    form.setValue("capabilities", {
                      ...form.getValues("capabilities"),
                      consumables: Boolean(checked),
                    })
                  }
                />
                <FormLabel>Consumables</FormLabel>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={form.watch("capabilities")?.chemicals ?? (form.watch("type") === "DISTRICT_LAB")}
                  disabled={form.watch("type") !== "DISTRICT_LAB"}
                  onCheckedChange={(checked) =>
                    form.setValue("capabilities", {
                      ...form.getValues("capabilities"),
                      chemicals: Boolean(checked),
                    })
                  }
                />
                <FormLabel>Chemicals</FormLabel>
              </div>
            </div>
            <FormDialogActions
              isSubmitting={false}
              onCancel={() => onOpenChange(false)}
              submitLabel={isEditing ? "Update Office" : "Create Office"}
            />
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
