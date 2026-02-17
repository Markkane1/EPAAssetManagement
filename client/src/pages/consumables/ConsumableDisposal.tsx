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
import { useNavigate } from 'react-router-dom';
import { useConsumableItems } from '@/hooks/useConsumableItems';
import { useOffices } from '@/hooks/useOffices';
import { useConsumableLots } from '@/hooks/useConsumableLots';
import { useConsumableContainers } from '@/hooks/useConsumableContainers';
import { useConsumableBalances, useDisposeConsumables } from '@/hooks/useConsumableInventory';
import { useConsumableReasonCodes } from '@/hooks/useConsumableReasonCodes';
import { useConsumableUnits } from '@/hooks/useConsumableUnits';
import { getCompatibleUnits } from '@/lib/unitUtils';
import type { ConsumableItem } from '@/types';
import { useConsumableMode } from '@/hooks/useConsumableMode';
import { filterItemsByMode, filterLocationsByMode } from '@/lib/consumableMode';
import { ConsumableModeToggle } from '@/components/consumables/ConsumableModeToggle';

const disposeSchema = z.object({
  locationId: z.string().min(1, 'Location is required'),
  itemId: z.string().min(1, 'Item is required'),
  lotId: z.string().optional(),
  containerId: z.string().optional(),
  qty: z.coerce.number().positive('Quantity must be greater than zero'),
  uom: z.string().min(1, 'Unit is required'),
  reasonCodeId: z.string().min(1, 'Reason code is required'),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

type DisposeFormData = z.infer<typeof disposeSchema>;

export default function ConsumableDisposal() {
  const navigate = useNavigate();
  const ALL_VALUE = '__all__';
  const { mode, setMode } = useConsumableMode();
  const { data: items } = useConsumableItems();
  const { data: units } = useConsumableUnits();
  const { data: locations } = useOffices({
    capability: mode === 'chemicals' ? 'chemicals' : 'consumables',
  });
  const { data: lots } = useConsumableLots();
  const { data: reasonCodes } = useConsumableReasonCodes('DISPOSE');
  const disposeMutation = useDisposeConsumables();

  const form = useForm<DisposeFormData>({
    resolver: zodResolver(disposeSchema),
    defaultValues: {
      locationId: '',
      itemId: '',
      lotId: ALL_VALUE,
      containerId: '',
      qty: 0,
      uom: '',
      reasonCodeId: '',
      reference: '',
      notes: '',
    },
  });

  const filteredItems = useMemo(() => filterItemsByMode(items || [], mode), [items, mode]);
  const filteredLocations = useMemo(() => filterLocationsByMode(locations || [], mode), [locations, mode]);
  const unitList = useMemo(() => units || [], [units]);
  const selectedLocationId = form.watch('locationId');
  const selectedItemId = form.watch('itemId');
  const selectedContainerId = form.watch('containerId');
  const selectedLotId = form.watch('lotId');
  const selectedUom = form.watch('uom');
  const allowedItemIds = useMemo(
    () => new Set(filteredItems.map((item) => item.id)),
    [filteredItems]
  );

  const selectedItem: ConsumableItem | undefined = useMemo(() => {
    return filteredItems.find((item) => item.id === selectedItemId);
  }, [filteredItems, selectedItemId]);

  useEffect(() => {
    const currentItem = form.getValues('itemId');
    if (currentItem && !filteredItems.some((item) => item.id === currentItem)) {
      form.setValue('itemId', '');
      form.setValue('lotId', ALL_VALUE);
      form.setValue('containerId', '');
    }
  }, [filteredItems, form, ALL_VALUE]);

  const locationFilterId = selectedLocationId;
  const containerFilters = useMemo(() => {
    if (!locationFilterId) return undefined;
    return { locationId: locationFilterId, status: 'IN_STOCK' };
  }, [locationFilterId]);

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
      if (lot.consumable_id !== selectedItem.id) return false;
      return (container.current_qty_base || 0) > 0;
    });
  }, [containers, lots, selectedItem]);

  const requiresContainer = Boolean(selectedItem?.requires_container_tracking || selectedItem?.is_controlled);
  const selectedContainer = containersForItem.find((container) => container.id === selectedContainerId);

  useEffect(() => {
    if (selectedItem && !form.getValues('uom')) {
      form.setValue('uom', selectedItem.base_uom);
    }
  }, [selectedItem, form]);

  useEffect(() => {
    if (filteredLocations.length === 0) return;
    const current = form.getValues('locationId');
    if (!current || !filteredLocations.some((loc) => loc.id === current)) {
      form.setValue('locationId', filteredLocations[0].id);
    }
  }, [filteredLocations, form]);

  useEffect(() => {
    if (!selectedContainer) return;
    form.setValue('lotId', selectedContainer.lot_id);
    if (selectedItem?.base_uom) {
      form.setValue('uom', selectedItem.base_uom);
    }
  }, [selectedContainer, selectedItem, form]);

  const balanceFilters = useMemo(() => {
    if (!selectedLocationId || !selectedItemId) return undefined;
    return {
      holderType: 'OFFICE' as const,
      holderId: selectedLocationId,
      itemId: selectedItemId,
    };
  }, [selectedLocationId, selectedItemId]);

  const { data: balances = [] } = useConsumableBalances(balanceFilters);
  const availableQty = balances.reduce((total, balance) => total + (balance.qty_on_hand_base || 0), 0);

  const handleSubmit = async (data: DisposeFormData) => {
    if (requiresContainer && !data.containerId) {
      form.setError('containerId', { message: 'Container is required for this item' });
      return;
    }
    await disposeMutation.mutateAsync({
      holderType: 'OFFICE',
      holderId: data.locationId,
      itemId: data.itemId,
      lotId: data.lotId && data.lotId !== ALL_VALUE ? data.lotId : undefined,
      containerId: data.containerId || undefined,
      qty: data.qty,
      uom: data.uom,
      reasonCodeId: data.reasonCodeId,
      reference: data.reference || undefined,
      notes: data.notes || undefined,
    });
    form.reset();
  };

  return (
    <MainLayout title="Consumable Disposal" description="Record disposal of consumables">
      <PageHeader
        title="Disposal"
        description="Dispose expired or contaminated materials"
        extra={<ConsumableModeToggle mode={mode} onChange={setMode} />}
      />

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Location *</Label>
                <Select value={selectedLocationId} onValueChange={(v) => form.setValue('locationId', v)}>
                  <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                  <SelectContent>
                    {filteredLocations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Item *</Label>
                <Select value={selectedItemId} onValueChange={(v) => form.setValue('itemId', v)}>
                  <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                  <SelectContent>
                    {filteredItems.map((item) => (
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
                  value={selectedLotId || ALL_VALUE}
                  onValueChange={(v) => form.setValue('lotId', v)}
                  disabled={Boolean(selectedContainer)}
                >
                  <SelectTrigger><SelectValue placeholder="Select lot" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_VALUE}>All lots</SelectItem>
                    {(lots || [])
                      .filter((lot) => {
                        if (selectedItemId) return lot.consumable_id === selectedItemId;
                        return allowedItemIds.has(lot.consumable_id);
                      })
                      .map((lot) => (
                        <SelectItem key={lot.id} value={lot.id}>{lot.batch_no}</SelectItem>
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
                <Label>Reason Code *</Label>
                <Select value={form.watch('reasonCodeId')} onValueChange={(v) => form.setValue('reasonCodeId', v)}>
                  <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                  <SelectContent>
                    {(reasonCodes || []).map((reason) => (
                      <SelectItem key={reason.id} value={reason.id}>{reason.code}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {requiresContainer && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Container *</Label>
                    <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={() => navigate('/consumables/containers')}>
                      Manage Containers
                    </Button>
                  </div>
                  <Select
                    value={selectedContainerId || ''}
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
                <Select value={selectedUom} onValueChange={(v) => form.setValue('uom', v)}>
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

            <div className="flex justify-end">
              <Button type="submit" disabled={disposeMutation.isPending}>
                {disposeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Record Disposal
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </MainLayout>
  );
}

