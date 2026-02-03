import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Pencil, Trash2, Loader2 } from 'lucide-react';
import type { Location } from '@/types';
import {
  useConsumableLocations,
  useCreateConsumableLocation,
  useUpdateConsumableLocation,
  useDeleteConsumableLocation,
} from '@/hooks/useConsumableLocations';

const locationSchema = z.object({
  name: z.string().min(1, 'Name is required').max(120),
  type: z.enum(['CENTRAL', 'LAB', 'SUBSTORE']).optional(),
  labCode: z.string().max(64).optional(),
  parentLocationId: z.string().optional(),
  division: z.string().max(120).optional(),
  district: z.string().max(120).optional(),
  address: z.string().max(200).optional(),
  contactNumber: z.string().max(64).optional(),
  isActive: z.boolean().optional(),
  capabilities: z.object({
    moveables: z.boolean().optional(),
    consumables: z.boolean().optional(),
    chemicals: z.boolean().optional(),
  }).optional(),
});

type LocationFormData = z.infer<typeof locationSchema>;

export default function ConsumableLocations() {
  const { data: locations, isLoading } = useConsumableLocations();
  const createLocation = useCreateConsumableLocation();
  const updateLocation = useUpdateConsumableLocation();
  const deleteLocation = useDeleteConsumableLocation();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);

  const form = useForm<LocationFormData>({
    resolver: zodResolver(locationSchema),
    defaultValues: {
      name: '',
      type: 'LAB',
      labCode: '',
      parentLocationId: '',
      division: '',
      district: '',
      address: '',
      contactNumber: '',
      isActive: true,
      capabilities: {
        moveables: true,
        consumables: true,
        chemicals: false,
      },
    },
  });

  useEffect(() => {
    if (editing) {
      form.reset({
        name: editing.name,
        type: (editing.type as 'CENTRAL' | 'LAB' | 'SUBSTORE') || 'LAB',
        labCode: editing.lab_code || '',
        parentLocationId: editing.parent_location_id || '',
        division: editing.division || '',
        district: editing.district || '',
        address: editing.address || '',
        contactNumber: editing.contact_number || '',
        isActive: editing.is_active ?? true,
        capabilities: {
          moveables: editing.capabilities?.moveables ?? true,
          consumables: editing.capabilities?.consumables ?? true,
          chemicals: editing.capabilities?.chemicals ?? (editing.type === 'LAB'),
        },
      });
    } else {
      form.reset({
        name: '',
        type: 'LAB',
        labCode: '',
        parentLocationId: '',
        division: '',
        district: '',
        address: '',
        contactNumber: '',
        isActive: true,
        capabilities: {
          moveables: true,
          consumables: true,
          chemicals: false,
        },
      });
    }
  }, [editing, form]);

  const handleSubmit = async (data: LocationFormData) => {
    const payload = {
      ...data,
      parentLocationId: data.parentLocationId || undefined,
      labCode: data.labCode || undefined,
      division: data.division || undefined,
      district: data.district || undefined,
      address: data.address || undefined,
      contactNumber: data.contactNumber || undefined,
    };
    if (editing) {
      await updateLocation.mutateAsync({ id: editing.id, data: payload });
    } else {
      await createLocation.mutateAsync(payload);
    }
    setIsModalOpen(false);
  };

  const handleDelete = (row: Location) => {
    if (confirm(`Delete ${row.name}?`)) {
      deleteLocation.mutate(row.id);
    }
  };

  const columns = [
    { key: 'name', label: 'Location' },
    {
      key: 'type',
      label: 'Type',
      render: (value: string) => <Badge variant="outline">{value || 'LAB'}</Badge>,
    },
    {
      key: 'capabilities.chemicals',
      label: 'Chemicals',
      render: (value: boolean | undefined, row: Location) => {
        const enabled = value ?? (row.type === 'LAB');
        return enabled ? 'Yes' : 'No';
      },
    },
    { key: 'lab_code', label: 'Lab Code' },
    {
      key: 'is_active',
      label: 'Status',
      render: (value: boolean) => (value === false ? 'Inactive' : 'Active'),
    },
  ];

  const actions = (row: Location) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => { setEditing(row); setIsModalOpen(true); }}>
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
      <MainLayout title="Consumable Locations" description="Manage consumable locations">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Consumable Locations" description="Manage consumable locations">
      <PageHeader
        title="Locations"
        description="Central store, labs, and substores"
        action={{ label: 'Add Location', onClick: () => { setEditing(null); setIsModalOpen(true); } }}
      />

      <DataTable
        columns={columns}
        data={(locations || []) as any}
        searchPlaceholder="Search locations..."
        actions={actions}
      />

      <Dialog open={isModalOpen} onOpenChange={(open) => { setIsModalOpen(open); if (!open) setEditing(null); }}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Location' : 'Add Location'}</DialogTitle>
            <DialogDescription>Configure consumable storage locations.</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input id="name" {...form.register('name')} />
                {form.formState.errors.name && (
                  <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.watch('type') || 'LAB'} onValueChange={(v) => form.setValue('type', v as any)}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CENTRAL">Central</SelectItem>
                    <SelectItem value="LAB">Lab</SelectItem>
                    <SelectItem value="SUBSTORE">Substore</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="labCode">Lab Code</Label>
                <Input id="labCode" {...form.register('labCode')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="parentLocationId">Parent Location ID</Label>
                <Input id="parentLocationId" {...form.register('parentLocationId')} placeholder="Optional" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="division">Division</Label>
                <Input id="division" {...form.register('division')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="district">District</Label>
                <Input id="district" {...form.register('district')} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={form.watch('capabilities')?.moveables ?? true}
                  onCheckedChange={(checked) =>
                    form.setValue('capabilities', {
                      ...form.getValues('capabilities'),
                      moveables: Boolean(checked),
                    })
                  }
                />
                <Label>Moveables</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={form.watch('capabilities')?.consumables ?? true}
                  onCheckedChange={(checked) =>
                    form.setValue('capabilities', {
                      ...form.getValues('capabilities'),
                      consumables: Boolean(checked),
                    })
                  }
                />
                <Label>Consumables</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={form.watch('capabilities')?.chemicals ?? (form.watch('type') === 'LAB')}
                  onCheckedChange={(checked) =>
                    form.setValue('capabilities', {
                      ...form.getValues('capabilities'),
                      chemicals: Boolean(checked),
                    })
                  }
                />
                <Label>Chemicals</Label>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" {...form.register('address')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactNumber">Contact Number</Label>
              <Input id="contactNumber" {...form.register('contactNumber')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editing ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
