import { useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocations } from "@/hooks/useLocations";
import { useAuth } from "@/contexts/AuthContext";
import {
  useCreateOfficeSubLocation,
  useDeleteOfficeSubLocation,
  useOfficeSubLocations,
  useUpdateOfficeSubLocation,
} from "@/hooks/useOfficeSubLocations";
import type { OfficeSubLocation } from "@/services/officeSubLocationService";
import { Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

const ALL_VALUE = "__all__";

export default function RoomsSections() {
  const { isOrgAdmin, locationId } = useAuth();
  const { data: locations = [] } = useLocations();
  const [selectedOfficeId, setSelectedOfficeId] = useState<string>(ALL_VALUE);
  const [formOpen, setFormOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<OfficeSubLocation | null>(null);
  const [sectionName, setSectionName] = useState("");
  const [formOfficeId, setFormOfficeId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const createSection = useCreateOfficeSubLocation();
  const updateSection = useUpdateOfficeSubLocation();
  const deleteSection = useDeleteOfficeSubLocation();

  const officeMap = useMemo(() => new Map(locations.map((office) => [office.id, office.name])), [locations]);
  const scopedOfficeOptions = useMemo(() => {
    if (isOrgAdmin) return locations;
    if (!locationId) return [];
    const matched = locations.find((office) => office.id === locationId);
    return matched ? [matched] : [{ id: locationId, name: locationId }];
  }, [isOrgAdmin, locationId, locations]);

  const effectiveOfficeId = isOrgAdmin
    ? selectedOfficeId === ALL_VALUE
      ? undefined
      : selectedOfficeId
    : locationId || undefined;

  const { data: sections = [], isLoading } = useOfficeSubLocations({
    officeId: effectiveOfficeId,
    includeInactive: true,
  });

  const rows = useMemo(
    () =>
      sections.map((section) => ({
        ...section,
        officeName: officeMap.get(section.office_id) || section.office_id || "Unknown",
      })),
    [sections, officeMap]
  );

  const columns = [
    { key: "name", label: "Section / Room" },
    { key: "officeName", label: "Office" },
    {
      key: "is_active",
      label: "Status",
      render: (value: boolean) => (value === false ? "Inactive" : "Active"),
    },
  ];

  const resetForm = () => {
    setSectionName("");
    setFormError(null);
    if (isOrgAdmin) {
      const defaultOfficeId =
        selectedOfficeId !== ALL_VALUE
          ? selectedOfficeId
          : scopedOfficeOptions[0]?.id || "";
      setFormOfficeId(defaultOfficeId);
    } else {
      setFormOfficeId(locationId || "");
    }
  };

  const openCreateModal = () => {
    setEditingSection(null);
    resetForm();
    setFormOpen(true);
  };

  const openEditModal = (row: OfficeSubLocation) => {
    setEditingSection(row);
    setSectionName(row.name || "");
    setFormOfficeId(row.office_id || "");
    setFormError(null);
    setFormOpen(true);
  };

  const handleSave = async () => {
    const normalizedName = sectionName.trim();
    if (!normalizedName) {
      setFormError("Section/room name is required.");
      return;
    }

    try {
      if (editingSection) {
        await updateSection.mutateAsync({
          id: editingSection.id || editingSection._id || "",
          data: { name: normalizedName },
        });
      } else if (isOrgAdmin) {
        if (!formOfficeId) {
          setFormError("Office is required.");
          return;
        }
        await createSection.mutateAsync({
          office_id: formOfficeId,
          name: normalizedName,
        });
      } else {
        await createSection.mutateAsync({
          name: normalizedName,
        });
      }

      setFormOpen(false);
      setEditingSection(null);
      setSectionName("");
      setFormError(null);
    } catch {
      // Error toast is handled in mutation hooks.
    }
  };

  const handleDelete = (row: OfficeSubLocation) => {
    if (!confirm(`Delete section "${row.name}"?`)) return;
    deleteSection.mutate(row.id || row._id || "");
  };

  return (
    <MainLayout title="Rooms & Sections" description="Manage office-specific rooms and sections">
      <PageHeader
        title="Rooms & Sections"
        description={
          isOrgAdmin
            ? "Create and manage rooms/sections for any office."
            : "Manage rooms/sections for your assigned office."
        }
        action={{ label: "Add Section", onClick: openCreateModal }}
      />

      <Card className="mt-6">
        <CardContent className="pt-6">
          <div className="space-y-4">
            {isOrgAdmin && (
              <div className="max-w-sm space-y-2">
                <Label>Office Filter</Label>
                <Select value={selectedOfficeId} onValueChange={setSelectedOfficeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="All offices" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_VALUE}>All offices</SelectItem>
                    {locations.map((office) => (
                      <SelectItem key={office.id} value={office.id}>
                        {office.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <DataTable
                columns={columns}
                data={rows}
                searchPlaceholder="Search sections..."
                useGlobalPageSearch={false}
                actions={(row) => (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditModal(row)}>
                        <Pencil className="h-4 w-4 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(row)}>
                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              />
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{editingSection ? "Edit Section" : "Add Section"}</DialogTitle>
            <DialogDescription>Sections (rooms) are scoped to an office.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {isOrgAdmin && !editingSection && (
              <div className="space-y-2">
                <Label>Office *</Label>
                <Select value={formOfficeId} onValueChange={setFormOfficeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select office" />
                  </SelectTrigger>
                  <SelectContent>
                    {scopedOfficeOptions.map((office) => (
                      <SelectItem key={office.id} value={office.id}>
                        {office.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="sectionName">Section / Room Name *</Label>
              <Input
                id="sectionName"
                value={sectionName}
                onChange={(event) => {
                  setSectionName(event.target.value);
                  if (formError) setFormError(null);
                }}
                placeholder="e.g. Section A, Room 101"
              />
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={createSection.isPending || updateSection.isPending}
            >
              {(createSection.isPending || updateSection.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingSection ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
