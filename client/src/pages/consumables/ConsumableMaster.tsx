import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Pencil, Trash2, Loader2 } from 'lucide-react';
import { useCategories } from '@/hooks/useCategories';
import {
  useConsumableItems,
  useCreateConsumableItem,
  useUpdateConsumableItem,
  useDeleteConsumableItem,
} from '@/hooks/useConsumableItems';
import { useConsumableUnits } from '@/hooks/useConsumableUnits';
import type { ConsumableItem } from '@/types';
import { ConsumableItemFormModal } from '@/components/forms/ConsumableItemFormModal';
import { useConsumableMode } from '@/hooks/useConsumableMode';
import { filterItemsByMode } from '@/lib/consumableMode';
import { ConsumableModeToggle } from '@/components/consumables/ConsumableModeToggle';
import { useAuth } from '@/contexts/AuthContext';

export default function ConsumableMaster() {
  const { role, isOrgAdmin } = useAuth();
  const { data: items, isLoading } = useConsumableItems();
  const { data: units } = useConsumableUnits();
  const { data: categories } = useCategories({ assetType: 'CONSUMABLE' });
  const createItem = useCreateConsumableItem();
  const updateItem = useUpdateConsumableItem();
  const deleteItem = useDeleteConsumableItem();
  const { mode, setMode } = useConsumableMode();
  const modeLabel = mode === 'chemicals' ? 'chemical' : 'general consumable';
  const canManage = isOrgAdmin || role === 'caretaker';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<ConsumableItem | null>(null);

  const categoryList = categories || [];
  const unitList = units || [];
  const itemList = filterItemsByMode(items || [], mode);

  const columns = [
    {
      key: 'name',
      label: 'Item',
      render: (value: string, row: ConsumableItem) => {
        const category = categoryList.find((cat) => cat.id === row.category_id)?.name || 'Uncategorized';
        return (
          <div>
            <p className="font-medium">{value}</p>
            <p className="text-xs text-muted-foreground">{category}</p>
          </div>
        );
      },
    },
    {
      key: 'base_uom',
      label: 'Base UoM',
      render: (value: string) => <Badge variant="outline">{value}</Badge>,
    },
    {
      key: 'is_chemical',
      label: 'Type',
      render: (value: boolean | null | undefined) => (
        <Badge variant="secondary">{value ? 'Chemical' : 'General'}</Badge>
      ),
    },
    {
      key: 'requires_lot_tracking',
      label: 'Lot',
      render: (value: boolean) => (value ? 'Yes' : 'No'),
    },
    {
      key: 'requires_container_tracking',
      label: 'Container',
      render: (value: boolean, row: ConsumableItem) =>
        row.is_controlled || value ? 'Yes' : 'No',
    },
    {
      key: 'default_min_stock',
      label: 'Min Stock',
      render: (value: number | null, row: ConsumableItem) =>
        value !== null ? `${value} ${row.base_uom}` : 'N/A',
    },
  ];

  const handleAdd = () => {
    setEditing(null);
    setIsModalOpen(true);
  };

  const handleEdit = (item: ConsumableItem) => {
    setEditing(item);
    setIsModalOpen(true);
  };

  const handleSubmit = async (data: any) => {
    if (editing) {
      await updateItem.mutateAsync({ id: editing.id, data });
    } else {
      await createItem.mutateAsync(data);
    }
  };

  const handleDelete = (item: ConsumableItem) => {
    if (confirm(`Delete ${item.name}?`)) {
      deleteItem.mutate(item.id);
    }
  };

  const actions = (row: ConsumableItem) => (
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

  if (isLoading) {
    return (
      <MainLayout title="Item Master" description="Manage consumable item master data">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Item Master" description="Consumable item master">
      <PageHeader
        title="Item Master"
        description={`Create and maintain ${modeLabel} inventory items`}
        extra={<ConsumableModeToggle mode={mode} onChange={setMode} />}
        action={canManage ? { label: 'Add Item', onClick: handleAdd } : undefined}
      />

      <DataTable
        columns={columns}
        data={itemList as any}
        searchPlaceholder="Search consumable items..."
        actions={canManage ? actions : undefined}
      />

      {canManage && (
        <ConsumableItemFormModal
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
          item={editing}
          categories={categoryList}
          units={unitList}
          onSubmit={handleSubmit}
        />
      )}
    </MainLayout>
  );
}

