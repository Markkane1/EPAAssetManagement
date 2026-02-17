import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/shared/DataTable";
import { Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { District, Division } from "@/types";
import { useDistricts, useCreateDistrict, useUpdateDistrict, useDeleteDistrict } from "@/hooks/useDistricts";
import { DistrictFormModal } from "@/components/forms/DistrictFormModal";

interface DistrictManagementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  divisions: Division[];
}

export function DistrictManagementModal({ open, onOpenChange, divisions }: DistrictManagementModalProps) {
  const { data: districts = [], isLoading } = useDistricts();
  const createDistrict = useCreateDistrict();
  const updateDistrict = useUpdateDistrict();
  const deleteDistrict = useDeleteDistrict();

  const [formOpen, setFormOpen] = useState(false);
  const [editingDistrict, setEditingDistrict] = useState<District | null>(null);

  const divisionMap = useMemo(
    () => new Map(divisions.map((division) => [division.id, division.name])),
    [divisions]
  );

  const handleAdd = () => {
    setEditingDistrict(null);
    setFormOpen(true);
  };

  const handleEdit = (district: District) => {
    setEditingDistrict(district);
    setFormOpen(true);
  };

  const handleSubmit = async (data: { name: string; divisionId: string }) => {
    if (editingDistrict) {
      await updateDistrict.mutateAsync({
        id: editingDistrict.id,
        data: { name: data.name, divisionId: data.divisionId },
      });
    } else {
      await createDistrict.mutateAsync({ name: data.name, divisionId: data.divisionId });
    }
  };

  const handleDelete = (district: District) => {
    if (confirm(`Delete district "${district.name}"?`)) {
      deleteDistrict.mutate(district.id);
    }
  };

  const rows: Array<District & { divisionName: string }> = districts.map((district) => ({
    ...district,
    divisionName: district.division_id ? divisionMap.get(district.division_id) || "Unassigned" : "Unassigned",
  }));

  const columns = [
    { key: "name", label: "District" },
    { key: "divisionName", label: "Division" },
    {
      key: "is_active",
      label: "Status",
      render: (value: boolean) => (
        <span className="text-sm text-muted-foreground">{value === false ? "Inactive" : "Active"}</span>
      ),
    },
  ];

  const actions = (row: District & { divisionName: string }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleEdit(row)}>
          <Pencil className="h-4 w-4 mr-2" /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(row)}>
          <Trash2 className="h-4 w-4 mr-2" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[760px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Districts</DialogTitle>
          <DialogDescription>Add, edit, or remove district entries.</DialogDescription>
        </DialogHeader>

        <div className="flex justify-end">
          <Button onClick={handleAdd}>Add District</Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            searchPlaceholder="Search districts..."
            useGlobalPageSearch={false}
            actions={actions}
          />
        )}

        <DistrictFormModal
          open={formOpen}
          onOpenChange={setFormOpen}
          district={editingDistrict}
          divisions={divisions}
          onSubmit={handleSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}
