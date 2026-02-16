import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Eye, Pencil, Trash2, Mail, Phone, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Vendor } from "@/types";
import { toast } from "sonner";
import { useVendors, useCreateVendor, useUpdateVendor, useDeleteVendor } from "@/hooks/useVendors";
import { VendorFormModal } from "@/components/forms/VendorFormModal";

export default function Vendors() {
  const { data: vendors, isLoading } = useVendors();
  const createVendor = useCreateVendor();
  const updateVendor = useUpdateVendor();
  const deleteVendor = useDeleteVendor();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);

  const vendorList = vendors || [];

  const columns = [
    { key: "name", label: "Vendor Name", render: (value: string, row: Vendor) => (
      <div><p className="font-medium">{value}</p><p className="text-xs text-muted-foreground">{row.contact_info}</p></div>
    )},
    { key: "email", label: "Email", render: (value: string) => <a href={`mailto:${value}`} className="text-primary hover:underline">{value}</a> },
    { key: "phone", label: "Phone", render: (value: string) => <span className="text-muted-foreground">{value}</span> },
    { key: "address", label: "Address", render: (value: string) => <span className="text-sm text-muted-foreground truncate max-w-[200px] block">{value}</span> },
  ];

  const handleAddVendor = () => {
    setEditingVendor(null);
    setIsModalOpen(true);
  };

  const handleEdit = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setIsModalOpen(true);
  };

  const handleSubmit = async (data: any) => {
    if (editingVendor) {
      await updateVendor.mutateAsync({ id: editingVendor.id, data });
    } else {
      await createVendor.mutateAsync(data);
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
        <DropdownMenuItem onClick={() => toast.info("View details would open")}>
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

      <DataTable columns={columns} data={vendorList} searchPlaceholder="Search vendors..." actions={actions} />

      <VendorFormModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        vendor={editingVendor}
        onSubmit={handleSubmit}
      />
    </MainLayout>
  );
}
