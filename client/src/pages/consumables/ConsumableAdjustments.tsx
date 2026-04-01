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
import { useOffices } from '@/hooks/useOffices';
import { useConsumableLots } from '@/hooks/useConsumableLots';
import { useConsumableContainers } from '@/hooks/useConsumableContainers';
import { useConsumableBalances, useAdjustConsumables } from '@/hooks/useConsumableInventory';
import { useConsumableReasonCodes } from '@/hooks/useConsumableReasonCodes';
import { useConsumableUnits } from '@/hooks/useConsumableUnits';
import { convertQuantity, getCompatibleUnits } from '@/lib/unitUtils';
import type { ConsumableItem } from '@/types';
import { useConsumableMode } from '@/hooks/useConsumableMode';
import { filterItemsByMode, filterLocationsByMode } from '@/lib/consumableMode';
import { ConsumableModeToggle } from '@/components/consumables/ConsumableModeToggle';
import { SearchableSelect } from '@/components/shared/SearchableSelect';
import { MetricCard, WorkflowPanel } from '@/components/shared/workflow';
import { useAuth } from '@/contexts/AuthContext';

const adjustSchema = z.object({
  locationId: z.string().min(1, 'Location is required'),
  itemId: z.string().min(1, 'Item is required'),
  lotId: z.string().optional(),
  containerId: z.string().optional(),
  actualQty: z.coerce.number().min(0),
  uom: z.string().min(1, 'Unit is required'),
  reasonCodeId: z.string().min(1, 'Reason code is required'),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

type AdjustFormData = z.infer<typeof adjustSchema>;

export default function ConsumableAdjustments() {
  const ALL_VALUE = '__all__';
  const { role, locationId } = useAuth();
  const { mode, setMode } = useConsumableMode();
  const { data: items } = useConsumableItems();
  const { data: units } = useConsumableUnits();
  const { data: locations } = useOffices({
    capability: mode === 'chemicals' ? 'chemicals' : 'consumables',
  });
  const { data: lots } = useConsumableLots();
  const { data: reasonCodes } = useConsumableReasonCodes('ADJUST');
  const adjustMutation = useAdjustConsumables();

  const form = useForm<AdjustFormData>({
    resolver: zodResolver(adjustSchema),
    defaultValues: {
      locationId: '',
      itemId: '',
      lotId: ALL_VALUE,
      containerId: '',
      actualQty: 0,
      uom: '',
      reasonCodeId: '',
      reference: '',
      notes: '',
    },
  });

  const filteredItems = useMemo(() => filterItemsByMode(items || [], mode), [items, mode]);
  const filteredLocations = useMemo(() => filterLocationsByMode(locations || [], mode), [locations, mode]);
  const scopedLocations = useMemo(
    () =>
      role === 'org_admin' || !locationId
        ? filteredLocations
        : filteredLocations.filter((location) => location.id === locationId),
    [filteredLocations, locationId, role]
  );
  const unitList = useMemo(() => units || [], [units]);
  const selectedLocationId = form.watch('locationId');
  const selectedItemId = form.watch('itemId');
  const selectedContainerId = form.watch('containerId');
  const selectedLotId = form.watch('lotId');
  const selectedUom = form.watch('uom');
  const selectedActualQty = form.watch('actualQty');
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
    if (scopedLocations.length === 0) return;
    const current = form.getValues('locationId');
    if (!current || !scopedLocations.some((loc) => loc.id === current)) {
      form.setValue('locationId', scopedLocations[0].id);
    }
  }, [form, scopedLocations]);

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
      lotId: selectedLotId && selectedLotId !== ALL_VALUE ? selectedLotId : undefined,
    };
  }, [selectedLocationId, selectedItemId, selectedLotId, ALL_VALUE]);

  const { data: balances = [] } = useConsumableBalances(balanceFilters);
  const systemQtyBase = balances.reduce((total, balance) => total + (balance.qty_on_hand_base || 0), 0);

  const systemQtyInSelectedUom = useMemo(() => {
    if (!selectedItem || !selectedUom) return systemQtyBase;
    const converted = convertQuantity(systemQtyBase, selectedItem.base_uom, selectedUom, unitList);
    return converted === null ? systemQtyBase : converted;
  }, [systemQtyBase, selectedItem, selectedUom, unitList]);

  const variance = selectedActualQty - systemQtyInSelectedUom;
  const locationCount = scopedLocations.length;
  const itemCount = filteredItems.length;

  const handleSubmit = async (data: AdjustFormData) => {
    if (!scopedLocations.some((location) => location.id === data.locationId)) {
      form.setError('locationId', { message: 'Selected location is invalid or unavailable' });
      return;
    }
    if (requiresContainer && !data.containerId) {
      form.setError('containerId', { message: 'Container is required for this item' });
      return;
    }
    const direction = variance >= 0 ? 'INCREASE' : 'DECREASE';
    const qty = Math.abs(variance);
    if (!Number.isFinite(qty) || qty <= 0) {
      form.setError('actualQty', { message: 'No adjustment is needed because the counted quantity matches system stock' });
      return;
    }

    await adjustMutation.mutateAsync({
      holderType: 'OFFICE',
      holderId: data.locationId,
      itemId: data.itemId,
      lotId: data.lotId && data.lotId !== ALL_VALUE ? data.lotId : undefined,
      containerId: data.containerId || undefined,
      qty,
      uom: data.uom,
      direction,
      reasonCodeId: data.reasonCodeId,
      reference: data.reference || undefined,
      notes: data.notes || undefined,
    });

    form.reset();
  };

  return (
    <MainLayout title="Cycle Count" description="Adjust inventory based on count">
      <PageHeader
        title="Adjustments"
        description="Cycle count and variance adjustments"
        eyebrow="Consumables workspace"
        meta={
          <>
            <span>{locationCount} locations available for adjustment</span>
            <span className="hidden h-1 w-1 rounded-full bg-border sm:inline-block" />
            <span>{itemCount} consumable items in the selected mode</span>
          </>
        }
        extra={<ConsumableModeToggle mode={mode} onChange={setMode} />}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Adjustment locations" value={locationCount} helper="Locations included in this mode" icon={Loader2} tone="primary" />
        <MetricCard label="Item options" value={itemCount} helper="Consumable records available for counting" icon={Loader2} tone="success" />
        <MetricCard label="Tracked containers" value={containersForItem.length} helper="Containers available for the selected item" icon={Loader2} />
        <MetricCard label="Variance" value={Number.isFinite(variance) ? variance : 0} helper={selectedUom || "Base unit"} icon={Loader2} tone="warning" />
      </div>

      <WorkflowPanel title="Cycle-count adjustment" description="Record actual counted stock, compare it against the system quantity, and post the variance through one consistent operational panel.">
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Location *</Label>
                <SearchableSelect
                  value={selectedLocationId}
                  onValueChange={(v) => form.setValue('locationId', v)}
                  placeholder="Select location"
                  searchPlaceholder="Search locations..."
                  emptyText="No locations found."
                  options={scopedLocations.map((loc) => ({ value: loc.id, label: loc.name }))}
                />
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
                <Label>System Qty</Label>
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  {systemQtyInSelectedUom.toFixed(2)} {selectedUom || selectedItem?.base_uom || ''}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Unit *</Label>
                <Select value={selectedUom} onValueChange={(v) => form.setValue('uom', v)}>
                  <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                  <SelectContent>
                    {compatibleUnits.map((unit) => (
                      <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {requiresContainer && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Container *</Label>
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
                <Label htmlFor="actualQty">Actual Count *</Label>
                <Input id="actualQty" type="number" min={0} step="0.01" {...form.register('actualQty')} />
              </div>
              <div className="space-y-2">
                <Label>Variance</Label>
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  {variance.toFixed(2)} {selectedUom || selectedItem?.base_uom || ''}
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="reference">Reference</Label>
                <Input id="reference" {...form.register('reference')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Input id="notes" {...form.register('notes')} />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={adjustMutation.isPending}>
                {adjustMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Post Adjustment
              </Button>
            </div>
          </form>
      </WorkflowPanel>
    </MainLayout>
  );
}


