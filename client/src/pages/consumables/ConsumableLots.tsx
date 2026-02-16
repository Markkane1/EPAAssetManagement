import { useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2, Loader2 } from "lucide-react";
import { useConsumableItems } from "@/hooks/useConsumableItems";
import { useConsumableSuppliers } from "@/hooks/useConsumableSuppliers";
import {
  useConsumableLots,
  useCreateConsumableLot,
  useUpdateConsumableLot,
  useDeleteConsumableLot,
} from "@/hooks/useConsumableLots";
import type { ConsumableLot } from "@/types";
import { ConsumableLotFormModal } from "@/components/forms/ConsumableLotFormModal";
import { useConsumableMode } from "@/hooks/useConsumableMode";
import { filterItemsByMode } from "@/lib/consumableMode";
import { ConsumableModeToggle } from "@/components/consumables/ConsumableModeToggle";
import { useAuth } from "@/contexts/AuthContext";

export default function ConsumableLots() {
  const { role, isOrgAdmin } = useAuth();
  const { mode, setMode } = useConsumableMode();
  const { data: items, isLoading: itemsLoading } = useConsumableItems();
  const { data: suppliers } = useConsumableSuppliers();
  const { data: lots, isLoading } = useConsumableLots();
  const createLot = useCreateConsumableLot();
  const updateLot = useUpdateConsumableLot();
  const deleteLot = useDeleteConsumableLot();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ConsumableLot | null>(null);

  const canManage =
    isOrgAdmin || role === "caretaker";

  const itemList = filterItemsByMode(items || [], mode);
  const itemMap = useMemo(
    () => new Map(itemList.map((item) => [item.id, item])),
    [itemList]
  );
  const supplierMap = useMemo(
    () => new Map((suppliers || []).map((supplier) => [supplier.id, supplier])),
    [suppliers]
  );

  const filteredLots = (lots || []).filter((lot) => itemMap.has(lot.consumable_item_id));

  const handleAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const handleEdit = (lot: ConsumableLot) => {
    setEditing(lot);
    setModalOpen(true);
  };

  const handleSubmit = async (data: any) => {
    if (editing) {
      await updateLot.mutateAsync({ id: editing.id, data });
    } else {
      await createLot.mutateAsync(data);
    }
  };

  const handleDelete = (lot: ConsumableLot) => {
    if (confirm(`Delete lot ${lot.lot_number}?`)) {
      deleteLot.mutate(lot.id);
    }
  };

  const columns = [
    {
      key: "lot_number",
      label: "Lot",
      render: (value: string) => <span className="font-mono">{value}</span>,
    },
    {
      key: "consumable_item_id",
      label: "Item",
      render: (value: string) => itemMap.get(value)?.name || "Unknown",
    },
    {
      key: "supplier_id",
      label: "Supplier",
      render: (value: string | null) => supplierMap.get(value || "")?.name || "N/A",
    },
    {
      key: "received_date",
      label: "Received",
      render: (value: string) => new Date(value).toLocaleDateString(),
    },
    {
      key: "expiry_date",
      label: "Expiry",
      render: (value: string | null) => (value ? new Date(value).toLocaleDateString() : "N/A"),
    },
  ];

  const actions = (row: ConsumableLot) => (
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
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(row)}>
          <Trash2 className="h-4 w-4 mr-2" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (isLoading || itemsLoading) {
    return (
      <MainLayout title="Lots" description="Manage lot records">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Lots" description="Manage lot records">
      <PageHeader
        title="Lots"
        description="Create and manage lot details"
        extra={<ConsumableModeToggle mode={mode} onChange={setMode} />}
        action={canManage ? { label: "Add Lot", onClick: handleAdd } : undefined}
      />

      <DataTable
        columns={columns}
        data={filteredLots as any}
        searchPlaceholder="Search lots..."
        actions={canManage ? actions : undefined}
      />

      {canManage && (
        <ConsumableLotFormModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          lot={editing}
          items={itemList}
          suppliers={suppliers || []}
          onSubmit={handleSubmit}
        />
      )}
    </MainLayout>
  );
}
