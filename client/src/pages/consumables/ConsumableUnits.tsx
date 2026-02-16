import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { MoreHorizontal, Pencil, Trash2, Loader2 } from 'lucide-react';
import {
  useConsumableUnits,
  useCreateConsumableUnit,
  useUpdateConsumableUnit,
  useDeleteConsumableUnit,
} from '@/hooks/useConsumableUnits';
import type { ConsumableUnit } from '@/types';
import { ConsumableUnitFormModal } from '@/components/forms/ConsumableUnitFormModal';
import { useAuth } from '@/contexts/AuthContext';

export default function ConsumableUnits() {
  const { role, isOrgAdmin } = useAuth();
  const { data: units, isLoading } = useConsumableUnits(false);
  const createUnit = useCreateConsumableUnit();
  const updateUnit = useUpdateConsumableUnit();
  const deleteUnit = useDeleteConsumableUnit();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ConsumableUnit | null>(null);

  const canManage = isOrgAdmin || role === 'caretaker';

  const handleAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const handleEdit = (unit: ConsumableUnit) => {
    setEditing(unit);
    setModalOpen(true);
  };

  const handleSubmit = async (data: any) => {
    if (editing) {
      await updateUnit.mutateAsync({ id: editing.id, data });
    } else {
      await createUnit.mutateAsync(data);
    }
  };

  const handleDelete = (unit: ConsumableUnit) => {
    if (confirm(`Delete unit ${unit.code}?`)) {
      deleteUnit.mutate(unit.id);
    }
  };

  const columns = [
    {
      key: 'code',
      label: 'Code',
      render: (value: string) => <span className="font-mono">{value}</span>,
    },
    { key: 'name', label: 'Name' },
    {
      key: 'group',
      label: 'Group',
      render: (value: string) => <Badge variant="outline">{value}</Badge>,
    },
    {
      key: 'to_base',
      label: 'To Base',
      render: (value: number) => value.toString(),
    },
    {
      key: 'is_active',
      label: 'Active',
      render: (value: boolean) => (value ? 'Yes' : 'No'),
    },
  ];

  const actions = (row: ConsumableUnit) => (
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
      <MainLayout title="Units" description="Manage UoM definitions">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Units" description="Manage unit definitions">
      <PageHeader
        title="Units"
        description="Create and manage unit definitions"
        action={canManage ? { label: 'Add Unit', onClick: handleAdd } : undefined}
      />

      <DataTable
        columns={columns}
        data={(units || []) as any}
        searchPlaceholder="Search units..."
        actions={canManage ? actions : undefined}
      />

      {canManage && (
        <ConsumableUnitFormModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          unit={editing}
          onSubmit={handleSubmit}
        />
      )}
    </MainLayout>
  );
}
