import { useEffect, useMemo } from 'react';
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
import { Loader2 } from 'lucide-react';
import { useConsumableItems } from '@/hooks/useConsumableItems';
import { useConsumableLocations } from '@/hooks/useConsumableLocations';
import { useConsumableLots } from '@/hooks/useConsumableLots';
import { useConsumableContainers } from '@/hooks/useConsumableContainers';
import { useConsumableBalances, useConsumeConsumables } from '@/hooks/useConsumableInventory';
import { getCompatibleUnits } from '@/lib/unitUtils';
import type { ConsumableItem } from '@/types';
import { useAuth } from '@/contexts/AuthContext';

const consumeSchema = z.object({
  locationId: z.string().min(1, 'Location is required'),
  itemId: z.string().min(1, 'Item is required'),
  lotId: z.string().optional(),
  containerId: z.string().optional(),
  qty: z.coerce.number().positive('Quantity must be greater than zero'),
  uom: z.string().min(1, 'Unit is required'),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

type ConsumeFormData = z.infer<typeof consumeSchema>;

const normalizeUom = (unit: string) => {
  const lower = unit.toLowerCase();
  if (lower === 'ml') return 'mL';
  if (lower === 'l') return 'L';
  return unit;
};

export default function ConsumableConsume() {
  const { locationId } = useAuth();
  const { data: items } = useConsumableItems();
  const { data: locations } = useConsumableLocations();
  const { data: lots } = useConsumableLots();
  const consumeMutation = useConsumeConsumables();

  const form = useForm<ConsumeFormData>({
    resolver: zodResolver(consumeSchema),
    defaultValues: {
      locationId: locationId || '',
      itemId: '',
      lotId: '',
      containerId: '',
      qty: 0,
      uom: '',
      reference: '',
      notes: '',
    },
  });

  const selectedItem: ConsumableItem | undefined = useMemo(() => {
    return items?.find((item) => item.id === form.watch('itemId'));
  }, [items, form]);

  const locationFilterId = form.watch('locationId');
  const containerFilters = useMemo(() => {
    if (!locationFilterId) return undefined;
    return { locationId: locationFilterId, status: 'IN_STOCK' };
  }, [locationFilterId]);

  const { data: containers = [] } = useConsumableContainers(containerFilters);

  const compatibleUnits = useMemo(() => {
    if (!selectedItem) return [] as string[];
    return getCompatibleUnits(selectedItem.base_uom.toLowerCase()).map((unit) => normalizeUom(unit));
  }, [selectedItem]);

  const containersForItem = useMemo(() => {
    if (!selectedItem) return [];
    const lotMap = new Map((lots || []).map((lot) => [lot.id, lot]));
    return containers.filter((container) => {
      const lot = lotMap.get(container.lot_id);
      if (!lot) return false;
      if (lot.consumable_item_id !== selectedItem.id) return false;
      return (container.current_qty_base || 0) > 0;
    });
  }, [containers, lots, selectedItem]);

  const requiresContainer = Boolean(selectedItem?.requires_container_tracking || selectedItem?.is_controlled);
  const selectedContainer = containersForItem.find((container) => container.id === form.watch('containerId'));

  useEffect(() => {
    if (selectedItem && !form.getValues('uom')) {
      form.setValue('uom', selectedItem.base_uom);
    }
  }, [selectedItem, form]);

  useEffect(() => {
    if (!selectedContainer) return;
    form.setValue('lotId', selectedContainer.lot_id);
    if (selectedItem?.base_uom) {
      form.setValue('uom', selectedItem.base_uom);
    }
  }, [selectedContainer, selectedItem, form]);

  const balanceFilters = useMemo(() => {
    if (!form.watch('locationId') || !form.watch('itemId')) return undefined;
    return { locationId: form.watch('locationId'), itemId: form.watch('itemId') };
  }, [form]);

  const { data: balances = [] } = useConsumableBalances(balanceFilters);
  const availableQty = balances.reduce((total, balance) => total + (balance.qty_on_hand_base || 0), 0);

  const handleSubmit = async (data: ConsumeFormData) => {
    if (requiresContainer && !data.containerId) {
      form.setError('containerId', { message: 'Container is required for this item' });
      return;
    }
    await consumeMutation.mutateAsync({
      locationId: data.locationId,
      itemId: data.itemId,
      lotId: data.lotId || undefined,
      containerId: data.containerId || undefined,
      qty: data.qty,
      uom: data.uom,
      reference: data.reference || undefined,
      notes: data.notes || undefined,
    });
    form.reset({ locationId: data.locationId, itemId: '', lotId: '', containerId: '', qty: 0, uom: '' });
  };

  return (
    <MainLayout title="Consumable Consumption" description="Record lab consumption">
      <PageHeader title="Consumption" description="Record consumable usage" />

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Lab Location *</Label>
                <Select value={form.watch('locationId')} onValueChange={(v) => form.setValue('locationId', v)}>
                  <SelectTrigger><SelectValue placeholder="Select lab" /></SelectTrigger>
                  <SelectContent>
                    {(locations || []).map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Lot (optional)</Label>
                <Select
                  value={form.watch('lotId') || ''}
                  onValueChange={(v) => form.setValue('lotId', v)}
                  disabled={Boolean(selectedContainer)}
                >
                  <SelectTrigger><SelectValue placeholder="FEFO default" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">FEFO default</SelectItem>
                    {(lots || [])
                      .filter((lot) => !form.watch('itemId') || lot.consumable_item_id === form.watch('itemId'))
                      .map((lot) => (
                        <SelectItem key={lot.id} value={lot.id}>{lot.lot_number}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Available</Label>
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  {availableQty} {selectedItem?.base_uom || ''}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reference">Reference</Label>
                <Input id="reference" {...form.register('reference')} />
              </div>
            </div>

            {requiresContainer && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Container *</Label>
                  <Select
                    value={form.watch('containerId') || ''}
                    onValueChange={(v) => form.setValue('containerId', v)}
                  >
                    <SelectTrigger><SelectValue placeholder="Select container" /></SelectTrigger>
                    <SelectContent>
                      {containersForItem.map((container) => (
                        <SelectItem key={container.id} value={container.id}>
                          {container.container_code} ({container.current_qty_base} {selectedItem?.base_uom || ''})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.containerId && (
                    <p className="text-sm text-destructive">{form.formState.errors.containerId.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Container Qty</Label>
                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                    {selectedContainer ? `${selectedContainer.current_qty_base} ${selectedItem?.base_uom || ''}` : 'Select a container'}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="qty">Quantity *</Label>
                <Input id="qty" type="number" min={0} step="0.01" {...form.register('qty')} />
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

            <div className="flex justify-end">
              <Button type="submit" disabled={consumeMutation.isPending}>
                {consumeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Record Consumption
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </MainLayout>
  );
}
