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
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { useConsumableItems } from '@/hooks/useConsumableItems';
import { useConsumableLocations } from '@/hooks/useConsumableLocations';
import { useConsumableLots } from '@/hooks/useConsumableLots';
import { useConsumableContainers } from '@/hooks/useConsumableContainers';
import { useConsumableBalances, useTransferConsumables } from '@/hooks/useConsumableInventory';
import { useConsumableUnits } from '@/hooks/useConsumableUnits';
import { getCompatibleUnits } from '@/lib/unitUtils';
import type { ConsumableItem } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useConsumableMode } from '@/hooks/useConsumableMode';
import { filterItemsByMode, filterLocationsByMode } from '@/lib/consumableMode';
import { ConsumableModeToggle } from '@/components/consumables/ConsumableModeToggle';

const transferSchema = z.object({
  fromLocationId: z.string().min(1, 'From location is required'),
  toLocationId: z.string().min(1, 'To location is required'),
  itemId: z.string().min(1, 'Item is required'),
  lotId: z.string().optional(),
  containerId: z.string().optional(),
  qty: z.coerce.number().positive('Quantity must be greater than zero'),
  uom: z.string().min(1, 'Unit is required'),
  reference: z.string().optional(),
  notes: z.string().optional(),
  allowNegative: z.boolean().optional(),
  overrideNote: z.string().optional(),
});

type TransferFormData = z.infer<typeof transferSchema>;

export default function ConsumableTransfers() {
  const FEFO_VALUE = '__fefo__';
  const { role, locationId } = useAuth();
  const { mode, setMode } = useConsumableMode();
  const { data: items } = useConsumableItems();
  const { data: units } = useConsumableUnits();
  const { data: locations } = useConsumableLocations({
    capability: mode === 'chemicals' ? 'chemicals' : 'consumables',
  });
  const { data: lots } = useConsumableLots();

  const transferMutation = useTransferConsumables();

  const [showOverride, setShowOverride] = useState(false);

  const form = useForm<TransferFormData>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      fromLocationId: locationId || '',
      toLocationId: '',
      itemId: '',
      lotId: FEFO_VALUE,
      containerId: '',
      qty: 0,
      uom: '',
      reference: '',
      notes: '',
      allowNegative: false,
      overrideNote: '',
    },
  });

  const filteredItems = useMemo(() => filterItemsByMode(items || [], mode), [items, mode]);
  const filteredLocations = useMemo(() => filterLocationsByMode(locations || [], mode), [locations, mode]);
  const unitList = useMemo(() => units || [], [units]);
  const allowedItemIds = useMemo(
    () => new Set(filteredItems.map((item) => item.id)),
    [filteredItems]
  );

  const selectedItem: ConsumableItem | undefined = useMemo(() => {
    return filteredItems.find((item) => item.id === form.watch('itemId'));
  }, [filteredItems, form]);

  useEffect(() => {
    const currentItem = form.getValues('itemId');
    if (currentItem && !filteredItems.some((item) => item.id === currentItem)) {
      form.setValue('itemId', '');
      form.setValue('lotId', FEFO_VALUE);
      form.setValue('containerId', '');
    }
  }, [filteredItems, form, FEFO_VALUE]);

  const fromLocationId = form.watch('fromLocationId');
  const containerFilters = useMemo(() => {
    if (!fromLocationId) return undefined;
    return { locationId: fromLocationId, status: 'IN_STOCK' };
  }, [fromLocationId]);

  const { data: containers = [] } = useConsumableContainers(containerFilters);

  const compatibleUnits = useMemo(() => {
    if (!selectedItem) return [] as string[];
    return getCompatibleUnits(selectedItem.base_uom, unitList);
  }, [selectedItem, unitList]);

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
    if (filteredLocations.length === 0) return;
    const currentFrom = form.getValues('fromLocationId');
    if (!currentFrom || !filteredLocations.some((loc) => loc.id === currentFrom)) {
      form.setValue('fromLocationId', filteredLocations[0].id);
    }
  }, [filteredLocations, form]);

  useEffect(() => {
    if (!selectedContainer) return;
    form.setValue('lotId', selectedContainer.lot_id);
    form.setValue('qty', selectedContainer.current_qty_base);
    if (selectedItem?.base_uom) {
      form.setValue('uom', selectedItem.base_uom);
    }
  }, [selectedContainer, selectedItem, form]);

  const balanceFilters = useMemo(() => {
    if (!form.watch('fromLocationId') || !form.watch('itemId')) return undefined;
    return { locationId: form.watch('fromLocationId'), itemId: form.watch('itemId') };
  }, [form]);

  const { data: balances = [] } = useConsumableBalances(balanceFilters);

  const availableQty = balances.reduce((total, balance) => total + (balance.qty_on_hand_base || 0), 0);

  const handleSubmit = async (data: TransferFormData) => {
    if (requiresContainer && !data.containerId) {
      form.setError('containerId', { message: 'Container is required for this item' });
      return;
    }
    await transferMutation.mutateAsync({
      fromLocationId: data.fromLocationId,
      toLocationId: data.toLocationId,
      itemId: data.itemId,
      lotId: data.lotId && data.lotId !== FEFO_VALUE ? data.lotId : undefined,
      containerId: data.containerId || undefined,
      qty: data.qty,
      uom: data.uom,
      reference: data.reference || undefined,
      notes: data.notes || undefined,
      allowNegative: data.allowNegative,
      overrideNote: data.overrideNote || undefined,
    });
    form.reset();
  };

  return (
    <MainLayout title="Consumable Transfers" description="Move stock between locations">
      <PageHeader
        title="Transfers"
        description="Transfer stock from Central Store or between labs"
        extra={<ConsumableModeToggle mode={mode} onChange={setMode} />}
      />

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>From Location *</Label>
                <Select value={form.watch('fromLocationId')} onValueChange={(v) => form.setValue('fromLocationId', v)}>
                  <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                  <SelectContent>
                    {filteredLocations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.fromLocationId && (
                  <p className="text-sm text-destructive">{form.formState.errors.fromLocationId.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>To Location *</Label>
                <Select value={form.watch('toLocationId')} onValueChange={(v) => form.setValue('toLocationId', v)}>
                  <SelectTrigger><SelectValue placeholder="Select destination" /></SelectTrigger>
                  <SelectContent>
                    {filteredLocations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.toLocationId && (
                  <p className="text-sm text-destructive">{form.formState.errors.toLocationId.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Item *</Label>
                <Select value={form.watch('itemId')} onValueChange={(v) => form.setValue('itemId', v)}>
                  <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                  <SelectContent>
                    {filteredItems.map((item) => (
                      <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.itemId && (
                  <p className="text-sm text-destructive">{form.formState.errors.itemId.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Lot (optional)</Label>
                <Select
                  value={form.watch('lotId') || FEFO_VALUE}
                  onValueChange={(v) => form.setValue('lotId', v)}
                  disabled={Boolean(selectedContainer)}
                >
                  <SelectTrigger><SelectValue placeholder="FEFO default" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={FEFO_VALUE}>FEFO default</SelectItem>
                    {(lots || [])
                      .filter((lot) => {
                        if (form.watch('itemId')) return lot.consumable_item_id === form.watch('itemId');
                        return allowedItemIds.has(lot.consumable_item_id);
                      })
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
                  <Label>Container Status</Label>
                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                    {selectedContainer ? selectedContainer.status : 'Select a container'}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="qty">Quantity *</Label>
                <Input
                  id="qty"
                  type="number"
                  min={0}
                  step="0.01"
                  disabled={Boolean(selectedContainer)}
                  {...form.register('qty')}
                />
                {form.formState.errors.qty && (
                  <p className="text-sm text-destructive">{form.formState.errors.qty.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>UoM *</Label>
                <Select
                  value={form.watch('uom')}
                  onValueChange={(v) => form.setValue('uom', v)}
                  disabled={Boolean(selectedContainer)}
                >
                  <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                  <SelectContent>
                    {compatibleUnits.map((unit) => (
                      <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reference">Reference</Label>
                <Input id="reference" {...form.register('reference')} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Input id="notes" {...form.register('notes')} />
            </div>

            {(role === 'admin' || role === 'super_admin') && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={form.watch('allowNegative') || false}
                    onCheckedChange={(checked) => {
                      form.setValue('allowNegative', Boolean(checked));
                      setShowOverride(Boolean(checked));
                    }}
                  />
                  <Label>Allow negative stock (admin override)</Label>
                </div>
                {showOverride && (
                  <div className="space-y-2">
                    <Label htmlFor="overrideNote">Override Note *</Label>
                    <Input id="overrideNote" {...form.register('overrideNote')} />
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={transferMutation.isPending}>
                {transferMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Transfer
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </MainLayout>
  );
}
