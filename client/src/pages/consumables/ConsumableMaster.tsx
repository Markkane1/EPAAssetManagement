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
import { MetricCard, TimelineList, WorkflowPanel } from '@/components/shared/workflow';

export default function ConsumableMaster() {
  const { role, isOrgAdmin } = useAuth();
  const { mode, setMode } = useConsumableMode();
  const { data: items, isLoading } = useConsumableItems();
  const { data: units } = useConsumableUnits();
  const categoryScope = mode === 'chemicals' ? 'LAB_ONLY' : 'GENERAL';
  const { data: categories } = useCategories({ assetType: 'CONSUMABLE', scope: categoryScope });
  const createItem = useCreateConsumableItem();
  const updateItem = useUpdateConsumableItem();
  const deleteItem = useDeleteConsumableItem();
  const modeLabel = mode === 'chemicals' ? 'chemical' : 'general consumable';
  const canManage = isOrgAdmin || role === 'caretaker';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<ConsumableItem | null>(null);

  const categoryList = categories || [];
  const unitList = units || [];
  const itemList = filterItemsByMode(items || [], mode);
  const lotTrackedCount = itemList.filter((item) => item.requires_lot_tracking).length;
  const containerTrackedCount = itemList.filter((item) => item.is_controlled || item.requires_container_tracking).length;
  const recentTimeline = itemList.slice(0, 5).map((item) => ({
    id: item.id,
    title: item.name,
    description: categoryList.find((cat) => cat.id === item.category_id)?.name || 'Uncategorized',
    meta: `${item.base_uom} base unit`,
    badge: item.is_chemical ? 'CHEMICAL' : 'GENERAL',
  }));

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
        eyebrow="Master data"
        meta={
          <>
            <span>{itemList.length} items in this mode</span>
            <span className="hidden h-1 w-1 rounded-full bg-border sm:inline-block" />
            <span>{canManage ? 'Editable' : 'Read-only'}</span>
          </>
        }
        extra={<ConsumableModeToggle mode={mode} onChange={setMode} />}
        action={canManage ? { label: 'Add Consumable Item', onClick: handleAdd } : undefined}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Items" value={itemList.length} helper="Visible in the active consumable mode" icon={Loader2} tone="primary" />
        <MetricCard label="Lot tracked" value={lotTrackedCount} helper="Items requiring batch-level tracking" icon={Loader2} tone="warning" />
        <MetricCard label="Container tracked" value={containerTrackedCount} helper="Items requiring container or controlled tracking" icon={Loader2} />
        <MetricCard label="Units" value={unitList.length} helper="Reusable consumable units of measure" icon={Loader2} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <WorkflowPanel title="Consumable item master" description="Manage item definitions, units, and tracking requirements.">
          <DataTable
            columns={columns}
            data={itemList as any}
            searchPlaceholder="Search consumable items..."
            actions={canManage ? actions : undefined}
            emptyState={{
              title: "No consumable items in this mode",
              description: "Create the first item to start managing consumable inventory.",
            }}
          />
        </WorkflowPanel>

        <WorkflowPanel title="Recent item definitions" description="A compact look at the latest visible item definitions in this mode.">
          <TimelineList
            items={recentTimeline}
            emptyTitle="No items yet"
            emptyDescription="Item definitions will appear here once you add consumables to the master list."
          />
        </WorkflowPanel>
      </div>

      {canManage && (
        <ConsumableItemFormModal
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
          item={editing}
          mode={mode}
          categories={categoryList}
          units={unitList}
          onSubmit={handleSubmit}
        />
      )}
    </MainLayout>
  );
}

