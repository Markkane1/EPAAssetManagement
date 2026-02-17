import { useEffect } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Office, Division, District, OfficeType } from "@/types";

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

const officeSchema = z
  .object({
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
    parentOfficeId: z.string().optional(),
    capabilities: z
      .object({
        moveables: z.boolean().optional(),
        consumables: z.boolean().optional(),
        chemicals: z.boolean().optional(),
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    const parentOfficeId = String(value.parentOfficeId || "").trim();
    if (value.type === "DIRECTORATE" && !parentOfficeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["parentOfficeId"],
        message: "Parent Head Office is required for Directorates",
      });
    }
    if (value.type !== "DIRECTORATE" && parentOfficeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["parentOfficeId"],
        message: "Parent Office is only allowed for Directorates",
      });
    }
  });

type OfficeFormData = z.infer<typeof officeSchema>;
type HeadOfficeOption = {
  id: string;
  name: string;
  is_active?: boolean | null;
};

interface OfficeFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  office?: Office | null;
  divisions?: Division[];
  districts?: District[];
  headOffices?: HeadOfficeOption[];
  onSubmit: (data: OfficeFormData) => Promise<void> | void;
}

export function OfficeFormModal({
  open,
  onOpenChange,
  office,
  divisions = [],
  districts = [],
  headOffices = [],
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
      type: coerceOfficeType(office?.type),
      parentOfficeId: office?.parent_office_id || "",
      capabilities: {
        moveables: office?.capabilities?.moveables ?? true,
        consumables: office?.capabilities?.consumables ?? true,
        chemicals: office?.capabilities?.chemicals ?? (coerceOfficeType(office?.type) === "DISTRICT_LAB"),
      },
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
        type: coerceOfficeType(office.type),
        parentOfficeId: office.parent_office_id || "",
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
        type: "DISTRICT_OFFICE",
        parentOfficeId: "",
        capabilities: {
          moveables: true,
          consumables: true,
          chemicals: false,
        },
      });
    }
  }, [office, form]);

  const handleSubmit = async (data: OfficeFormData) => {
    await onSubmit({
      ...data,
      division: data.division.trim(),
      district: data.district.trim(),
      address: data.address.trim(),
      contactNumber: normalizePhoneForSubmit(data.contactNumber),
      parentOfficeId: data.type === "DIRECTORATE" ? String(data.parentOfficeId || "").trim() || undefined : undefined,
    });
    onOpenChange(false);
  };

  const activeDivisions = divisions.filter((division) => division.is_active !== false);
  const activeDistricts = districts.filter((district) => district.is_active !== false);
  const selectedType = form.watch("type");
  const activeHeadOffices = headOffices.filter((entry) => entry.is_active !== false);

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
  const headOfficeOptions: HeadOfficeOption[] = Array.from(
    new Map(
      [
        ...activeHeadOffices.map((entry) => [entry.id, entry]),
        ...(office?.parent_office_id && selectedType === "DIRECTORATE"
          ? [[office.parent_office_id, { id: office.parent_office_id, name: "Current Parent Head Office" }]]
          : []),
      ]
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

  useEffect(() => {
    if (selectedType !== "DIRECTORATE" && form.getValues("parentOfficeId")) {
      form.setValue("parentOfficeId", "", { shouldDirty: false, shouldValidate: false });
    }
  }, [selectedType, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
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
                    <Select
                      value={field.value || undefined}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select division" />
                      </SelectTrigger>
                      <SelectContent>
                        {divisionOptions.map((division) => (
                          <SelectItem key={division.id} value={division.name}>
                            {division.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                    <Select
                      value={field.value || undefined}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select district" />
                      </SelectTrigger>
                      <SelectContent>
                        {districtOptions.map((district) => (
                          <SelectItem key={district.id} value={district.name}>
                            {district.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
              <FormField
                control={form.control}
                name="parentOfficeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Parent Head Office *</FormLabel>
                    <FormControl>
                      <Select
                        value={field.value || undefined}
                        onValueChange={field.onChange}
                        disabled={headOfficeOptions.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select head office" />
                        </SelectTrigger>
                        <SelectContent>
                          {headOfficeOptions.map((entry) => (
                            <SelectItem key={entry.id} value={entry.id}>
                              {entry.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    {headOfficeOptions.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Create an active Head Office first, then add Directorates.
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
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
