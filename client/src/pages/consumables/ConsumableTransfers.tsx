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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { useConsumableItems } from '@/hooks/useConsumableItems';
import { useOffices } from '@/hooks/useOffices';
import { useConsumableLots } from '@/hooks/useConsumableLots';
import { useConsumableContainers } from '@/hooks/useConsumableContainers';
import { useConsumableBalances, useTransferConsumables } from '@/hooks/useConsumableInventory';
import { useConsumableUnits } from '@/hooks/useConsumableUnits';
import { getCompatibleUnits } from '@/lib/unitUtils';
import type { ConsumableItem } from '@/types';
import type { InventoryHolderType } from '@/services/consumableInventoryService';
import { useAuth } from '@/contexts/AuthContext';
import { useConsumableMode } from '@/hooks/useConsumableMode';
import { filterItemsByMode, filterLocationsByMode } from '@/lib/consumableMode';
import { ConsumableModeToggle } from '@/components/consumables/ConsumableModeToggle';

const FEFO_VALUE = '__fefo__';
const STORE_CODE = 'HEAD_OFFICE_STORE';

const transferSchema = z.object({
  fromHolderKey: z.string().min(1, 'From holder is required'),
  toHolderKey: z.string().min(1, 'To holder is required'),
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

type HolderOption = {
  key: string;
  id: string;
  holderType: InventoryHolderType;
  name: string;
};

function buildHolderKey(holderType: InventoryHolderType, holderId: string) {
  return `${holderType}:${holderId}`;
}

function parseHolderKey(key: string): { holderType: InventoryHolderType; holderId: string } | null {
  const [rawType, ...rest] = String(key || '').split(':');
  const holderId = rest.join(':').trim();
  const holderType = String(rawType || '').trim().toUpperCase();
  if (!holderId) return null;
  if (holderType === 'STORE' || holderType === 'OFFICE') {
    return { holderType, holderId };
  }
  return null;
}

export default function ConsumableTransfers() {
  const { role, locationId } = useAuth();
  const [itemPickerOpen, setItemPickerOpen] = useState(false);
  const { mode, setMode } = useConsumableMode();
  const { data: items } = useConsumableItems();
  const { data: units } = useConsumableUnits();
  const { data: locations } = useOffices({
    capability: mode === 'chemicals' ? 'chemicals' : 'consumables',
  });
  const { data: lots } = useConsumableLots();

  const transferMutation = useTransferConsumables();

  const [showOverride, setShowOverride] = useState(false);
  const canOverrideNegative = role === 'org_admin' || role === 'caretaker';

  const form = useForm<TransferFormData>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      fromHolderKey: '',
      toHolderKey: '',
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
  const restrictToAssignedLocation = role !== 'org_admin' && Boolean(locationId);
  const scopedLocations = useMemo(
    () =>
      restrictToAssignedLocation
        ? filteredLocations.filter((office) => office.id === locationId)
        : filteredLocations,
    [restrictToAssignedLocation, filteredLocations, locationId]
  );
  const allowedOfficeIds = useMemo(() => new Set(scopedLocations.map((office) => office.id)), [scopedLocations]);

  const holderOptions = useMemo<HolderOption[]>(() => {
    const options: HolderOption[] = [
      {
        key: buildHolderKey('STORE', STORE_CODE),
        id: STORE_CODE,
        holderType: 'STORE',
        name: 'Head Office Store (System)',
      },
      ...scopedLocations.map((office) => ({
        key: buildHolderKey('OFFICE', office.id),
        id: office.id,
        holderType: 'OFFICE' as const,
        name: `${office.name} (Office)`,
      })),
    ];
    return options;
  }, [scopedLocations]);

  const unitList = useMemo(() => units || [], [units]);
  const allUnitCodes = useMemo(
    () => Array.from(new Set(unitList.map((unit) => String(unit.code || '').trim()).filter(Boolean))),
    [unitList]
  );
  const selectedItemId = form.watch('itemId');
  const selectedContainerId = form.watch('containerId');
  const selectedLotId = form.watch('lotId');
  const selectedUom = form.watch('uom');
  const fromHolderKey = form.watch('fromHolderKey');
  const toHolderKey = form.watch('toHolderKey');
  const fromHolder = useMemo(() => parseHolderKey(fromHolderKey), [fromHolderKey]);

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
      form.setValue('lotId', FEFO_VALUE);
      form.setValue('containerId', '');
    }
  }, [filteredItems, form]);

  const containerFilters = useMemo(() => {
    if (!fromHolder || fromHolder.holderType !== 'OFFICE') return undefined;
    return { locationId: fromHolder.holderId, status: 'IN_STOCK' as const };
  }, [fromHolder]);

  const { data: containers = [] } = useConsumableContainers(containerFilters);

  const compatibleUnits = useMemo(() => {
    if (!selectedItem) return allUnitCodes;
    const resolved = getCompatibleUnits(selectedItem.base_uom, unitList);
    const next = resolved.length ? resolved : allUnitCodes;
    if (!next.includes(selectedItem.base_uom)) {
      return [selectedItem.base_uom, ...next];
    }
    return next;
  }, [selectedItem, unitList, allUnitCodes]);

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
    const currentUom = form.getValues('uom');
    if (currentUom && compatibleUnits.includes(currentUom)) return;
    if (selectedItem?.base_uom) {
      form.setValue('uom', selectedItem.base_uom);
      return;
    }
    if (compatibleUnits.length > 0) {
      form.setValue('uom', compatibleUnits[0]);
    }
  }, [compatibleUnits, selectedItem, form]);

  useEffect(() => {
    if (holderOptions.length === 0) return;
    const currentFrom = form.getValues('fromHolderKey');
    if (!currentFrom || !holderOptions.some((holder) => holder.key === currentFrom)) {
      if (locationId && allowedOfficeIds.has(locationId)) {
        form.setValue('fromHolderKey', buildHolderKey('OFFICE', locationId));
      } else {
        form.setValue('fromHolderKey', holderOptions[0].key);
      }
    }

    const currentTo = form.getValues('toHolderKey');
    if (!currentTo || !holderOptions.some((holder) => holder.key === currentTo)) {
      const defaultTo = holderOptions.find((holder) => holder.holderType === 'STORE')?.key || holderOptions[0].key;
      form.setValue('toHolderKey', defaultTo);
    }
  }, [holderOptions, form, locationId, allowedOfficeIds]);

  useEffect(() => {
    if (!selectedContainer) return;
    form.setValue('lotId', selectedContainer.lot_id);
    form.setValue('qty', selectedContainer.current_qty_base);
    if (selectedItem?.base_uom) {
      form.setValue('uom', selectedItem.base_uom);
    }
  }, [selectedContainer, selectedItem, form]);

  const balanceFilters = useMemo(() => {
    if (!selectedItemId || !fromHolder) return undefined;
    return {
      holderType: fromHolder.holderType,
      holderId: fromHolder.holderId,
      itemId: selectedItemId,
    };
  }, [selectedItemId, fromHolder]);

  const { data: balances = [] } = useConsumableBalances(balanceFilters);

  const availableQty = balances.reduce((total, balance) => total + (balance.qty_on_hand_base || 0), 0);

  const fromHolderName = holderOptions.find((holder) => holder.key === fromHolderKey)?.name || '';
  const toHolderName = holderOptions.find((holder) => holder.key === toHolderKey)?.name || '';

  const handleSubmit = async (data: TransferFormData) => {
    const parsedFrom = parseHolderKey(data.fromHolderKey);
    const parsedTo = parseHolderKey(data.toHolderKey);
    if (!parsedFrom || !parsedTo) {
      if (!parsedFrom) {
        form.setError('fromHolderKey', { message: 'From holder is required' });
      }
      if (!parsedTo) {
        form.setError('toHolderKey', { message: 'To holder is required' });
      }
      return;
    }

    if (parsedFrom.holderType === parsedTo.holderType && parsedFrom.holderId === parsedTo.holderId) {
      form.setError('toHolderKey', { message: 'Destination holder must be different from source holder' });
      return;
    }

    if (restrictToAssignedLocation && locationId) {
      const fromIsInvalidOffice = parsedFrom.holderType === 'OFFICE' && parsedFrom.holderId !== locationId;
      const toIsInvalidOffice = parsedTo.holderType === 'OFFICE' && parsedTo.holderId !== locationId;
      if (fromIsInvalidOffice || toIsInvalidOffice) {
        form.setError('toHolderKey', {
          message: 'You can transfer only for your assigned office and central store',
        });
        return;
      }
    }

    if (requiresContainer && !data.containerId) {
      form.setError('containerId', { message: 'Container is required for this item' });
      return;
    }

    await transferMutation.mutateAsync({
      fromHolderType: parsedFrom.holderType,
      fromHolderId: parsedFrom.holderId,
      toHolderType: parsedTo.holderType,
      toHolderId: parsedTo.holderId,
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

    form.reset({
      fromHolderKey: data.fromHolderKey,
      toHolderKey: data.toHolderKey,
      itemId: '',
      lotId: FEFO_VALUE,
      containerId: '',
      qty: 0,
      uom: '',
      reference: '',
      notes: '',
      allowNegative: false,
      overrideNote: '',
    });
    setShowOverride(false);
  };

  return (
    <MainLayout title="Consumable Transfers" description="Move stock between offices and central store">
      <PageHeader
        title="Transfers"
        description="Transfer stock between central store and offices"
        extra={<ConsumableModeToggle mode={mode} onChange={setMode} />}
      />

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>From Holder *</Label>
                <Select value={fromHolderKey} onValueChange={(v) => form.setValue('fromHolderKey', v)}>
                  <SelectTrigger><SelectValue placeholder="Select source holder" /></SelectTrigger>
                  <SelectContent>
                    {holderOptions.map((holder) => (
                      <SelectItem key={holder.key} value={holder.key}>{holder.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fromHolderName ? <p className="text-xs text-muted-foreground">{fromHolderName}</p> : null}
                {form.formState.errors.fromHolderKey && (
                  <p className="text-sm text-destructive">{form.formState.errors.fromHolderKey.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>To Holder *</Label>
                <Select value={toHolderKey} onValueChange={(v) => form.setValue('toHolderKey', v)}>
                  <SelectTrigger><SelectValue placeholder="Select destination holder" /></SelectTrigger>
                  <SelectContent>
                    {holderOptions.map((holder) => (
                      <SelectItem key={holder.key} value={holder.key}>{holder.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {toHolderName ? <p className="text-xs text-muted-foreground">{toHolderName}</p> : null}
                {form.formState.errors.toHolderKey && (
                  <p className="text-sm text-destructive">{form.formState.errors.toHolderKey.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Item *</Label>
                <Popover open={itemPickerOpen} onOpenChange={setItemPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between">
                      {selectedItem ? selectedItem.name : 'Search item by name...'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Type item name..." />
                      <CommandList>
                        <CommandEmpty>No item found.</CommandEmpty>
                        {filteredItems.map((item) => (
                          <CommandItem
                            key={item.id}
                            value={`${item.name} ${item.base_uom}`}
                            onSelect={() => {
                              form.setValue('itemId', item.id);
                              setItemPickerOpen(false);
                            }}
                          >
                            {item.name}
                          </CommandItem>
                        ))}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {form.formState.errors.itemId && (
                  <p className="text-sm text-destructive">{form.formState.errors.itemId.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Lot (optional)</Label>
                <Select
                  value={selectedLotId || FEFO_VALUE}
                  onValueChange={(v) => form.setValue('lotId', v)}
                  disabled={Boolean(selectedContainer)}
                >
                  <SelectTrigger><SelectValue placeholder="FEFO default" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={FEFO_VALUE}>FEFO default</SelectItem>
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
            </div>

            {requiresContainer && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Container *</Label>
                  <Select
                    value={selectedContainerId || ''}
                    onValueChange={(v) => form.setValue('containerId', v)}
                    disabled={fromHolder?.holderType !== 'OFFICE'}
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
                  {(fromHolder?.holderType !== 'OFFICE') && (
                    <p className="text-xs text-muted-foreground">
                      Container selection is available only when source holder is an office.
                    </p>
                  )}
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
                  value={selectedUom}
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
                {form.formState.errors.uom && (
                  <p className="text-sm text-destructive">{form.formState.errors.uom.message}</p>
                )}
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

            {canOverrideNegative && (
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
