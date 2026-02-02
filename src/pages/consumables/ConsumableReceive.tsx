import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useConsumableItems } from '@/hooks/useConsumableItems';
import { useConsumableSuppliers } from '@/hooks/useConsumableSuppliers';
import { useConsumableLocations } from '@/hooks/useConsumableLocations';
import { useReceiveConsumables } from '@/hooks/useConsumableInventory';
import { getCompatibleUnits } from '@/lib/unitUtils';
import type { ConsumableItem } from '@/types';

const receiveSchema = z.object({
  locationId: z.string().min(1, 'Location is required'),
  itemId: z.string().min(1, 'Item is required'),
  lotNumber: z.string().min(1, 'Lot number is required'),
  receivedDate: z.string().min(1, 'Received date is required'),
  expiryDate: z.string().optional(),
  supplierId: z.string().optional(),
  qty: z.coerce.number().positive('Quantity must be greater than zero'),
  uom: z.string().min(1, 'Unit is required'),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

type ReceiveFormData = z.infer<typeof receiveSchema>;

type ContainerInput = { containerCode: string; initialQty: string };

const normalizeUom = (unit: string) => {
  const lower = unit.toLowerCase();
  if (lower === 'ml') return 'mL';
  if (lower === 'l') return 'L';
  return unit;
};

export default function ConsumableReceive() {
  const { data: items } = useConsumableItems();
  const { data: suppliers } = useConsumableSuppliers();
  const { data: locations } = useConsumableLocations('CENTRAL');
  const receiveMutation = useReceiveConsumables();

  const [containers, setContainers] = useState<ContainerInput[]>([]);

  const form = useForm<ReceiveFormData>({
    resolver: zodResolver(receiveSchema),
    defaultValues: {
      locationId: '',
      itemId: '',
      lotNumber: '',
      receivedDate: new Date().toISOString().split('T')[0],
      expiryDate: '',
      supplierId: '',
      qty: 0,
      uom: '',
      reference: '',
      notes: '',
    },
  });

  const selectedItem: ConsumableItem | undefined = useMemo(() => {
    return items?.find((item) => item.id === form.watch('itemId'));
  }, [items, form]);

  const compatibleUnits = useMemo(() => {
    if (!selectedItem) return [] as string[];
    const units = getCompatibleUnits(selectedItem.base_uom.toLowerCase());
    return units.map((unit) => normalizeUom(unit));
  }, [selectedItem]);

  useEffect(() => {
    if (locations && locations.length > 0 && !form.watch('locationId')) {
      form.setValue('locationId', locations[0].id);
    }
  }, [locations, form]);

  useEffect(() => {
    if (selectedItem && !form.watch('uom')) {
      form.setValue('uom', selectedItem.base_uom);
    }
  }, [selectedItem, form]);

  const addContainer = () => {
    setContainers((prev) => [...prev, { containerCode: '', initialQty: '' }]);
  };

  const removeContainer = (index: number) => {
    setContainers((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateContainer = (index: number, key: keyof ContainerInput, value: string) => {
    setContainers((prev) => prev.map((item, idx) => (idx === index ? { ...item, [key]: value } : item)));
  };

  const handleSubmit = async (data: ReceiveFormData) => {
    const requiresContainer = Boolean(selectedItem?.requires_container_tracking || selectedItem?.is_controlled);
    if (requiresContainer && containers.length === 0) {
      form.setError('itemId', { message: 'This item requires container entries' });
      return;
    }

    const payload: any = {
      locationId: data.locationId,
      itemId: data.itemId,
      lot: {
        lotNumber: data.lotNumber,
        receivedDate: data.receivedDate,
        expiryDate: data.expiryDate || undefined,
        supplierId: data.supplierId || undefined,
      },
      qty: data.qty,
      uom: data.uom,
      reference: data.reference || undefined,
      notes: data.notes || undefined,
    };

    if (containers.length > 0) {
      payload.containers = containers.map((container) => ({
        containerCode: container.containerCode,
        initialQty: Number(container.initialQty || 0),
      }));
    }

    await receiveMutation.mutateAsync(payload);
    form.reset();
    setContainers([]);
  };

  return (
    <MainLayout title="Lot Receiving" description="Receive consumables into Central Store">
      <PageHeader
        title="Lot Receiving"
        description="Receive lots into the Central Store"
      />

      <Card>
        <CardContent className="pt-6 space-y-6">
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Central Store *</Label>
                <Select value={form.watch('locationId')} onValueChange={(v) => form.setValue('locationId', v)}>
                  <SelectTrigger><SelectValue placeholder="Select Central Store" /></SelectTrigger>
                  <SelectContent>
                    {(locations || []).map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.locationId && (
                  <p className="text-sm text-destructive">{form.formState.errors.locationId.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Item *</Label>
                <Select value={form.watch('itemId')} onValueChange={(v) => form.setValue('itemId', v)}>
                  <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                  <SelectContent>
                    {(items || []).map((item) => (
                      <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.itemId && (
                  <p className="text-sm text-destructive">{form.formState.errors.itemId.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="lotNumber">Lot Number *</Label>
                <Input id="lotNumber" {...form.register('lotNumber')} />
                {form.formState.errors.lotNumber && (
                  <p className="text-sm text-destructive">{form.formState.errors.lotNumber.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Supplier</Label>
                <Select value={form.watch('supplierId') || ''} onValueChange={(v) => form.setValue('supplierId', v)}>
                  <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>
                    {(suppliers || []).map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="receivedDate">Received Date *</Label>
                <Input id="receivedDate" type="date" {...form.register('receivedDate')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expiryDate">Expiry Date</Label>
                <Input id="expiryDate" type="date" {...form.register('expiryDate')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reference">Reference</Label>
                <Input id="reference" {...form.register('reference')} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="qty">Quantity *</Label>
                <Input id="qty" type="number" min={0} step="0.01" {...form.register('qty')} />
                {form.formState.errors.qty && (
                  <p className="text-sm text-destructive">{form.formState.errors.qty.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>UoM *</Label>
                <Select value={form.watch('uom')} onValueChange={(v) => form.setValue('uom', v)}>
                  <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                  <SelectContent>
                    {compatibleUnits.map((unit) => (
                      <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Input id="notes" {...form.register('notes')} />
              </div>
            </div>

            {(selectedItem?.requires_container_tracking || selectedItem?.is_controlled) && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Container Details</h4>
                    <p className="text-sm text-muted-foreground">Controlled items require container tracking.</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addContainer}>
                    <Plus className="h-4 w-4 mr-2" /> Add Container
                  </Button>
                </div>
                {containers.length === 0 && (
                  <p className="text-sm text-destructive">At least one container is required.</p>
                )}
                {containers.map((container, index) => (
                  <div key={index} className="grid grid-cols-3 gap-4 items-end">
                    <div className="space-y-2">
                      <Label>Container Code</Label>
                      <Input value={container.containerCode} onChange={(e) => updateContainer(index, 'containerCode', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Initial Qty</Label>
                      <Input type="number" min={0} step="0.01" value={container.initialQty} onChange={(e) => updateContainer(index, 'initialQty', e.target.value)} />
                    </div>
                    <Button type="button" variant="ghost" onClick={() => removeContainer(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={receiveMutation.isPending}>
                {receiveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Receive Lot
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </MainLayout>
  );
}
