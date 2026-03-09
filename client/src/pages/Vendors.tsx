import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, Eye, Pencil, Trash2, Mail, Phone, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Vendor } from "@/types";
import {
  useVendors,
  useVendor,
  useCreateVendor,
  useUpdateVendor,
  useDeleteVendor,
} from "@/hooks/useVendors";
import { VendorFormModal } from "@/components/forms/VendorFormModal";
import { useAuth } from "@/contexts/AuthContext";
import { useLocations } from "@/hooks/useLocations";
import { SearchableSelect } from "@/components/shared/SearchableSelect";

export default function Vendors() {
  const { role, locationId } = useAuth();
  const isOrgAdmin = role === "org_admin";
  const [officeFilter, setOfficeFilter] = useState<string>("all");
  const { data: locations = [] } = useLocations();
  const selectedOfficeId = isOrgAdmin && officeFilter !== "all" ? officeFilter : undefined;
  const { data: vendors, isLoading } = useVendors(selectedOfficeId);
  const createVendor = useCreateVendor();
  const updateVendor = useUpdateVendor();
  const deleteVendor = useDeleteVendor();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [viewingVendorId, setViewingVendorId] = useState<string | null>(null);
  const {
    data: viewingVendor,
    isLoading: isViewingVendor,
    isError: isViewingVendorError,
  } = useVendor(viewingVendorId || "");

  const vendorList = vendors || [];
  const scopedLocations = isOrgAdmin
    ? locations
    : locations.filter((office) => office.id === locationId);

  const locationNameById = locations.reduce<Record<string, string>>((acc, office) => {
    acc[office.id] = office.name;
    return acc;
  }, {});

  const columns = [
    { key: "name", label: "Vendor Name", render: (value: string, row: Vendor) => (
      <div><p className="font-medium">{value}</p><p className="text-xs text-muted-foreground">{row.contact_info}</p></div>
    )},
    { key: "email", label: "Email", render: (value: string) => <a href={`mailto:${value}`} className="text-primary hover:underline">{value}</a> },
    { key: "phone", label: "Phone", render: (value: string) => <span className="text-muted-foreground">{value}</span> },
    { key: "address", label: "Address", render: (value: string) => <span className="text-sm text-muted-foreground truncate max-w-[200px] block">{value}</span> },
    ...(isOrgAdmin
      ? [
          {
            key: "office_id",
            label: "Office",
            render: (value: string | null) =>
              value ? locationNameById[value] || "Unknown Office" : "Unassigned",
          },
        ]
      : []),
  ];

  const handleAddVendor = () => {
    setEditingVendor(null);
    setIsModalOpen(true);
  };

  const handleEdit = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setIsModalOpen(true);
  };

  const handleView = (vendorId: string) => {
    setViewingVendorId(vendorId);
  };

  const handleSubmit = async (data: any) => {
    const payload = {
      ...data,
      officeId: isOrgAdmin
        ? String(data.officeId || selectedOfficeId || "").trim() || undefined
        : undefined,
    };
    if (editingVendor) {
      await updateVendor.mutateAsync({ id: editingVendor.id, data: payload });
    } else {
      await createVendor.mutateAsync(payload);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this vendor?")) {
      deleteVendor.mutate(id);
    }
  };

  const actions = (row: Vendor) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleView(row.id)}>
          <Eye className="h-4 w-4 mr-2" /> View Details
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleEdit(row)}>
          <Pencil className="h-4 w-4 mr-2" /> Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => window.location.href = `mailto:${row.email}`}>
          <Mail className="h-4 w-4 mr-2" /> Send Email
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => window.location.href = `tel:${row.phone}`}>
          <Phone className="h-4 w-4 mr-2" /> Call
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(row.id)}>
          <Trash2 className="h-4 w-4 mr-2" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (isLoading) {
    return (
      <MainLayout title="Vendors" description="Manage your suppliers">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Vendors" description="Manage your suppliers">
      <PageHeader
        title="Vendors"
        description="View and manage asset suppliers and vendors"
        action={{ label: "Add Vendor", onClick: handleAddVendor }}
      />

      {isOrgAdmin && (
        <div className="mb-4 w-full max-w-sm">
          <SearchableSelect
            value={officeFilter}
            onValueChange={setOfficeFilter}
            placeholder="Filter by office"
            searchPlaceholder="Search offices..."
            emptyText="No offices found."
            options={[
              { value: "all", label: "All Offices" },
              ...locations.map((office) => ({ value: office.id, label: office.name })),
            ]}
          />
        </div>
      )}

      <DataTable columns={columns} data={vendorList} searchPlaceholder="Search vendors..." actions={actions} />

      <VendorFormModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        vendor={editingVendor}
        isOrgAdmin={isOrgAdmin}
        locations={scopedLocations}
        defaultOfficeId={isOrgAdmin ? selectedOfficeId || locationId || null : locationId}
        onSubmit={handleSubmit}
      />

      <Dialog open={Boolean(viewingVendorId)} onOpenChange={(open) => (!open ? setViewingVendorId(null) : null)}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{viewingVendor?.name || "Vendor details"}</DialogTitle>
            <DialogDescription>
              Review supplier contact details and office assignment.
            </DialogDescription>
          </DialogHeader>
          {isViewingVendor ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : isViewingVendorError || !viewingVendor ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Unable to load vendor details.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {viewingVendor.office_id ? (
                  <Badge variant="outline">
                    {locationNameById[viewingVendor.office_id] || "Assigned Office"}
                  </Badge>
                ) : (
                  <Badge variant="secondary">Unassigned</Badge>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Contact Person</p>
                  <p className="mt-1 text-sm font-medium">{viewingVendor.contact_info || "Not recorded"}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Email</p>
                  <p className="mt-1 break-all text-sm font-medium">{viewingVendor.email || "Not recorded"}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Phone</p>
                  <p className="mt-1 text-sm font-medium">{viewingVendor.phone || "Not recorded"}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Created</p>
                  <p className="mt-1 text-sm font-medium">
                    {new Date(viewingVendor.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Address</p>
                <p className="mt-1 text-sm leading-6 text-foreground">
                  {viewingVendor.address || "No address recorded."}
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setViewingVendorId(null)}>
                  Close
                </Button>
                <Button
                  onClick={() => {
                    setViewingVendorId(null);
                    handleEdit(viewingVendor);
                  }}
                >
                  Edit Vendor
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
