import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Loader2, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import type { ConsumableContainer } from '@/types';
import { useConsumableLots } from '@/hooks/useConsumableLots';
import { useConsumableItems } from '@/hooks/useConsumableItems';
import { useOffices } from '@/hooks/useOffices';
import {
  useConsumableContainers,
  useCreateConsumableContainer,
  useDeleteConsumableContainer,
  useUpdateConsumableContainer,
} from '@/hooks/useConsumableContainers';
import { useAuth } from '@/contexts/AuthContext';

const ALL_VALUE = '__all__';

const containerSchema = z.object({
  lotId: z.string().min(1, 'Lot is required'),
  containerCode: z.string().min(1, 'Container code is required'),
  initialQtyBase: z.coerce.number().min(0, 'Initial qty must be 0 or greater'),
  currentQtyBase: z.coerce.number().min(0, 'Current qty must be 0 or greater'),
  currentLocationId: z.string().min(1, 'Location is required'),
  status: z.enum(['IN_STOCK', 'EMPTY', 'DISPOSED', 'LOST']),
  openedDate: z.string().optional(),
});

type ContainerFormData = z.infer<typeof containerSchema>;

function ContainerFormModal(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingContainer: ConsumableContainer | null;
  lots: Array<{ id: string; batch_no: string }>;
  locations: Array<{ id: string; name: string }>;
  onSubmit: (data: ContainerFormData) => Promise<void>;
}) {
  const { open, onOpenChange, editingContainer, lots, locations, onSubmit } = props;
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<ContainerFormData>({
    resolver: zodResolver(containerSchema),
    values: {
      lotId: editingContainer?.lot_id || '',
      containerCode: editingContainer?.container_code || '',
      initialQtyBase: editingContainer?.initial_qty_base || 0,
      currentQtyBase: editingContainer?.current_qty_base || 0,
      currentLocationId: editingContainer?.current_location_id || '',
      status: (editingContainer?.status || 'IN_STOCK') as 'IN_STOCK' | 'EMPTY' | 'DISPOSED' | 'LOST',
      openedDate: editingContainer?.opened_date || '',
    },
  });

  const submit = async (data: ContainerFormData) => {
    setIsSubmitting(true);
    try {
      await onSubmit(data);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingContainer ? 'Edit Container' : 'Add Container'}</DialogTitle>
          <DialogDescription>Manage tracked consumable containers.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Lot *</Label>
              <Select value={form.watch('lotId')} onValueChange={(value) => form.setValue('lotId', value)}>
                <SelectTrigger><SelectValue placeholder="Select lot" /></SelectTrigger>
                <SelectContent>
                  {lots.map((lot) => (
                    <SelectItem key={lot.id} value={lot.id}>{lot.batch_no}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.lotId && (
                <p className="text-sm text-destructive">{form.formState.errors.lotId.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="containerCode">Container Code *</Label>
              <Input id="containerCode" {...form.register('containerCode')} />
              {form.formState.errors.containerCode && (
                <p className="text-sm text-destructive">{form.formState.errors.containerCode.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="initialQtyBase">Initial Qty (base) *</Label>
              <Input id="initialQtyBase" type="number" min={0} step="0.01" {...form.register('initialQtyBase')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currentQtyBase">Current Qty (base) *</Label>
              <Input id="currentQtyBase" type="number" min={0} step="0.01" {...form.register('currentQtyBase')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Location *</Label>
              <Select value={form.watch('currentLocationId')} onValueChange={(value) => form.setValue('currentLocationId', value)}>
                <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                <SelectContent>
                  {locations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.currentLocationId && (
                <p className="text-sm text-destructive">{form.formState.errors.currentLocationId.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Status *</Label>
              <Select
                value={form.watch('status')}
                onValueChange={(value) =>
                  form.setValue('status', value as 'IN_STOCK' | 'EMPTY' | 'DISPOSED' | 'LOST')
                }
              >
                <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="IN_STOCK">In Stock</SelectItem>
                  <SelectItem value="EMPTY">Empty</SelectItem>
                  <SelectItem value="DISPOSED">Disposed</SelectItem>
                  <SelectItem value="LOST">Lost</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="openedDate">Opened Date</Label>
            <Input id="openedDate" type="date" {...form.register('openedDate')} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingContainer ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ConsumableContainers() {
  const { role, isOrgAdmin } = useAuth();
  const [selectedLocationId, setSelectedLocationId] = useState(ALL_VALUE);
  const [selectedStatus, setSelectedStatus] = useState(ALL_VALUE);
  const [formOpen, setFormOpen] = useState(false);
  const [editingContainer, setEditingContainer] = useState<ConsumableContainer | null>(null);

  const { data: lots = [] } = useConsumableLots();
  const { data: items = [] } = useConsumableItems();
  const { data: locations = [] } = useOffices();
  const filters = useMemo(() => {
    const value: { locationId?: string; status?: string } = {};
    if (selectedLocationId !== ALL_VALUE) value.locationId = selectedLocationId;
    if (selectedStatus !== ALL_VALUE) value.status = selectedStatus;
    return value;
  }, [selectedLocationId, selectedStatus]);
  const { data: containers = [], isLoading } = useConsumableContainers(filters);

  const createContainer = useCreateConsumableContainer();
  const updateContainer = useUpdateConsumableContainer();
  const deleteContainer = useDeleteConsumableContainer();
  const canCreateOrDelete = isOrgAdmin || role === 'caretaker';
  const canUpdate = canCreateOrDelete || role === 'office_head';

  const lotMap = useMemo(() => new Map(lots.map((lot) => [lot.id, lot])), [lots]);
  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const locationMap = useMemo(() => new Map(locations.map((location) => [location.id, location.name])), [locations]);

  const columns = [
    { key: 'container_code', label: 'Container' },
    {
      key: 'lot_id',
      label: 'Lot',
      render: (value: string) => lotMap.get(value)?.batch_no || 'Unknown',
    },
    {
      key: 'lot_id_item',
      label: 'Item',
      render: (_: unknown, row: ConsumableContainer) => {
        const lot = lotMap.get(row.lot_id);
        if (!lot) return 'Unknown';
        return itemMap.get(lot.consumable_id)?.name || 'Unknown';
      },
    },
    {
      key: 'current_qty_base',
      label: 'Current Qty',
      render: (value: number) => value,
    },
    {
      key: 'current_location_id',
      label: 'Location',
      render: (value: string) => locationMap.get(value) || 'Unknown',
    },
    { key: 'status', label: 'Status' },
  ];

  const actions = (row: ConsumableContainer) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canUpdate && (
          <DropdownMenuItem
            onClick={() => {
              setEditingContainer(row);
              setFormOpen(true);
            }}
          >
            <Pencil className="h-4 w-4 mr-2" /> Edit
          </DropdownMenuItem>
        )}
        {canCreateOrDelete && (
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => {
              if (confirm(`Delete container "${row.container_code}"?`)) {
                deleteContainer.mutate(row.id);
              }
            }}
          >
            <Trash2 className="h-4 w-4 mr-2" /> Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const handleSubmit = async (data: ContainerFormData) => {
    if (editingContainer) {
      await updateContainer.mutateAsync({
        id: editingContainer.id,
        data: {
          lotId: data.lotId,
          containerCode: data.containerCode,
          initialQtyBase: data.initialQtyBase,
          currentQtyBase: data.currentQtyBase,
          currentLocationId: data.currentLocationId,
          status: data.status,
          openedDate: data.openedDate || undefined,
        },
      });
      return;
    }

    await createContainer.mutateAsync({
      lotId: data.lotId,
      containerCode: data.containerCode,
      initialQtyBase: data.initialQtyBase,
      currentQtyBase: data.currentQtyBase,
      currentLocationId: data.currentLocationId,
      status: data.status,
      openedDate: data.openedDate || undefined,
    });
  };

  return (
    <MainLayout title="Consumable Containers" description="Manage tracked containers">
      <PageHeader
        title="Containers"
        description="Create, update, and remove tracked lot containers"
        action={
          canCreateOrDelete
            ? {
                label: 'Add Container',
                onClick: () => {
                  setEditingContainer(null);
                  setFormOpen(true);
                },
              }
            : undefined
        }
      />

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Location</Label>
              <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                <SelectTrigger><SelectValue placeholder="All locations" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>All locations</SelectItem>
                  {locations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>All statuses</SelectItem>
                  <SelectItem value="IN_STOCK">In Stock</SelectItem>
                  <SelectItem value="EMPTY">Empty</SelectItem>
                  <SelectItem value="DISPOSED">Disposed</SelectItem>
                  <SelectItem value="LOST">Lost</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center h-56">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={containers as any[]}
          searchPlaceholder="Search containers..."
          actions={canUpdate || canCreateOrDelete ? actions : undefined}
        />
      )}

      <ContainerFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        editingContainer={editingContainer}
        lots={lots}
        locations={locations}
        onSubmit={handleSubmit}
      />
    </MainLayout>
  );
}
