import { useState } from "react";
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
import type { Division } from "@/types";
import { useDivisions, useCreateDivision, useUpdateDivision, useDeleteDivision } from "@/hooks/useDivisions";
import { DivisionFormModal } from "@/components/forms/DivisionFormModal";

interface DivisionManagementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DivisionManagementModal({ open, onOpenChange }: DivisionManagementModalProps) {
  const { data: divisions = [], isLoading } = useDivisions();
  const createDivision = useCreateDivision();
  const updateDivision = useUpdateDivision();
  const deleteDivision = useDeleteDivision();

  const [formOpen, setFormOpen] = useState(false);
  const [editingDivision, setEditingDivision] = useState<Division | null>(null);

  const handleAdd = () => {
    setEditingDivision(null);
    setFormOpen(true);
  };

  const handleEdit = (division: Division) => {
    setEditingDivision(division);
    setFormOpen(true);
  };

  const handleSubmit = async (data: { name: string }) => {
    if (editingDivision) {
      await updateDivision.mutateAsync({ id: editingDivision.id, data });
    } else {
      await createDivision.mutateAsync(data);
    }
  };

  const handleDelete = (division: Division) => {
    if (confirm(`Delete division "${division.name}"?`)) {
      deleteDivision.mutate(division.id);
    }
  };

  const columns = [
    { key: "name", label: "Division" },
    {
      key: "is_active",
      label: "Status",
      render: (value: boolean) => (
        <span className="text-sm text-muted-foreground">{value === false ? "Inactive" : "Active"}</span>
      ),
    },
  ];

  const actions = (row: Division) => (
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
      <DialogContent className="sm:max-w-[720px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Divisions</DialogTitle>
          <DialogDescription>Add, edit, or remove division entries.</DialogDescription>
        </DialogHeader>

        <div className="flex justify-end">
          <Button onClick={handleAdd}>Add Division</Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={divisions}
            searchPlaceholder="Search divisions..."
            actions={actions}
          />
        )}

        <DivisionFormModal
          open={formOpen}
          onOpenChange={setFormOpen}
          division={editingDivision}
          onSubmit={handleSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}
