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
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Loader2 } from 'lucide-react';
import { useConsumableItems } from '@/hooks/useConsumableItems';
import { useOffices } from '@/hooks/useOffices';
import { useConsumableLots } from '@/hooks/useConsumableLots';
import { useConsumableContainers } from '@/hooks/useConsumableContainers';
import { useConsumableBalances, useConsumeConsumables } from '@/hooks/useConsumableInventory';
import { useConsumableUnits } from '@/hooks/useConsumableUnits';
import { useEmployees } from '@/hooks/useEmployees';
import { useOfficeSubLocations } from '@/hooks/useOfficeSubLocations';
import { getCompatibleUnits } from '@/lib/unitUtils';
import type { ConsumableItem } from '@/types';
import type { InventoryHolderType } from '@/services/consumableInventoryService';
import { useAuth } from '@/contexts/AuthContext';
import { useConsumableMode } from '@/hooks/useConsumableMode';
import { filterItemsByMode, filterLocationsByMode } from '@/lib/consumableMode';
import { ConsumableModeToggle } from '@/components/consumables/ConsumableModeToggle';

const FEFO_VALUE = '__fefo__';
const holderTypeSchema = z.enum(['OFFICE', 'SUB_LOCATION', 'EMPLOYEE']);

const consumeSchema = z.object({
  locationId: z.string().min(1, 'Location is required'),
  holderType: holderTypeSchema,
  holderId: z.string().min(1, 'Holder is required'),
  itemId: z.string().min(1, 'Item is required'),
  lotId: z.string().optional(),
  containerId: z.string().optional(),
  qty: z.coerce.number().positive('Quantity must be greater than zero'),
  uom: z.string().min(1, 'Unit is required'),
  reference: z.string().optional(),
  notes: z.string().min(1, 'Remarks are required').max(500, 'Remarks cannot exceed 500 characters'),
});

type ConsumeFormData = z.infer<typeof consumeSchema>;
type ConsumeHolderType = z.infer<typeof holderTypeSchema>;

type HolderOption = {
  id: string;
  holderType: ConsumeHolderType;
  label: string;
};

export default function ConsumableConsume() {
  const { user, locationId, role } = useAuth();
  const [itemPickerOpen, setItemPickerOpen] = useState(false);
  const { mode, setMode } = useConsumableMode();
  const { data: items } = useConsumableItems();
  const { data: units } = useConsumableUnits();
  const { data: locations } = useOffices({
    capability: mode === 'chemicals' ? 'chemicals' : 'consumables',
  });
  const { data: lots } = useConsumableLots();
  const { data: employees = [] } = useEmployees();
  const consumeMutation = useConsumeConsumables();

  const form = useForm<ConsumeFormData>({
    resolver: zodResolver(consumeSchema),
    defaultValues: {
      locationId: locationId || '',
      holderType: role === 'employee' ? 'EMPLOYEE' : 'OFFICE',
      holderId: '',
      itemId: '',
      lotId: FEFO_VALUE,
      containerId: '',
      qty: 0,
      uom: '',
      reference: '',
      notes: '',
    },
  });

  const modeFilteredItems = useMemo(() => filterItemsByMode(items || [], mode), [items, mode]);
  const filteredLocations = useMemo(() => filterLocationsByMode(locations || [], mode), [locations, mode]);
  const selectedLocationId = form.watch('locationId');
  const selectedHolderType = form.watch('holderType');
  const selectedHolderId = form.watch('holderId');
  const selectedItemId = form.watch('itemId');
  const selectedContainerId = form.watch('containerId');
  const selectedLotId = form.watch('lotId');
  const selectedUom = form.watch('uom');
  const unitList = useMemo(() => units || [], [units]);
  const allUnitCodes = useMemo(
    () => Array.from(new Set(unitList.map((unit) => String(unit.code || '').trim()).filter(Boolean))),
    [unitList]
  );

  const { data: subLocations = [] } = useOfficeSubLocations({
    officeId: selectedLocationId || undefined,
  });

  const locationEmployees = useMemo(
    () =>
      employees.filter(
        (employee) =>
          employee.is_active !== false &&
          employee.location_id &&
          String(employee.location_id) === selectedLocationId
      ),
    [employees, selectedLocationId]
  );

  const currentEmployee = useMemo(() => {
    if (!user?.id) return null;
    return (
      locationEmployees.find(
        (employee) => employee.user_id && String(employee.user_id) === String(user.id)
      ) || null
    );
  }, [locationEmployees, user?.id]);

  const selectedLocation = useMemo(
    () => filteredLocations.find((location) => location.id === selectedLocationId),
    [filteredLocations, selectedLocationId]
  );

  const holderTypeOptions = useMemo(() => {
    const base: ConsumeHolderType[] = role === 'employee' ? ['EMPLOYEE', 'SUB_LOCATION'] : ['OFFICE', 'SUB_LOCATION', 'EMPLOYEE'];
    return base.filter((holderType) => {
      if (holderType === 'OFFICE') return Boolean(selectedLocationId);
      if (holderType === 'SUB_LOCATION') return subLocations.length > 0;
      if (holderType === 'EMPLOYEE') return role === 'employee' ? Boolean(currentEmployee) : locationEmployees.length > 0;
      return false;
    });
  }, [role, selectedLocationId, subLocations.length, currentEmployee, locationEmployees.length]);

  const officeOption = useMemo<HolderOption[]>(
    () =>
      selectedLocation
        ? [
            {
              id: selectedLocation.id,
              holderType: 'OFFICE',
              label: `${selectedLocation.name} (Office Storage)`,
            },
          ]
        : [],
    [selectedLocation]
  );

  const sectionOptions = useMemo<HolderOption[]>(
    () =>
      subLocations.map((section) => ({
        id: section.id,
        holderType: 'SUB_LOCATION',
        label: `${section.name} (Section)`,
      })),
    [subLocations]
  );

  const employeeOptions = useMemo<HolderOption[]>(() => {
    const scopedEmployees =
      role === 'employee' && currentEmployee ? [currentEmployee] : locationEmployees;
    return scopedEmployees.map((employee) => ({
      id: employee.id,
      holderType: 'EMPLOYEE',
      label: `${employee.first_name || ''} ${employee.last_name || ''}`.trim() || employee.email,
    }));
  }, [role, currentEmployee, locationEmployees]);

  const holderOptions = useMemo<HolderOption[]>(() => {
    if (selectedHolderType === 'OFFICE') return officeOption;
    if (selectedHolderType === 'SUB_LOCATION') return sectionOptions;
    return employeeOptions;
  }, [selectedHolderType, officeOption, sectionOptions, employeeOptions]);

  useEffect(() => {
    if (role !== 'org_admin') {
      if (locationId && form.getValues('locationId') !== locationId) {
        form.setValue('locationId', locationId);
      }
      return;
    }
    if (filteredLocations.length === 0) return;
    const current = form.getValues('locationId');
    if (!current || !filteredLocations.some((loc) => loc.id === current)) {
      form.setValue('locationId', filteredLocations[0].id);
    }
  }, [filteredLocations, form, locationId, role]);

  useEffect(() => {
    const currentHolderType = form.getValues('holderType');
    if (!holderTypeOptions.includes(currentHolderType)) {
      const fallbackType =
        holderTypeOptions[0] || (role === 'employee' ? 'EMPLOYEE' : 'OFFICE');
      form.setValue('holderType', fallbackType);
      form.setValue('holderId', '');
    }
  }, [holderTypeOptions, role, form]);

  useEffect(() => {
    if (holderOptions.length === 0) {
      form.setValue('holderId', '');
      return;
    }
    const currentHolderId = form.getValues('holderId');
    if (!currentHolderId || !holderOptions.some((holder) => holder.id === currentHolderId)) {
      form.setValue('holderId', holderOptions[0].id);
    }
  }, [holderOptions, form]);

  const holderFilters = useMemo(() => {
    if (!selectedHolderId) return undefined;
    return {
      holderType: selectedHolderType as InventoryHolderType,
      holderId: selectedHolderId,
    };
  }, [selectedHolderId, selectedHolderType]);
  const { data: holderBalances = [] } = useConsumableBalances(holderFilters);

  const availableByItemId = useMemo(() => {
    const map = new Map<string, number>();
    holderBalances.forEach((balance) => {
      const itemId = balance.consumable_item_id;
      map.set(itemId, (map.get(itemId) || 0) + (balance.qty_on_hand_base || 0));
    });
    return map;
  }, [holderBalances]);

  const filteredItems = useMemo(
    () =>
      modeFilteredItems.filter((item) => (availableByItemId.get(item.id) || 0) > 0),
    [modeFilteredItems, availableByItemId]
  );

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

  const locationFilterId =
    selectedHolderType === 'OFFICE' && selectedHolderId ? selectedHolderId : '';
  const containerFilters = useMemo(() => {
    if (!locationFilterId) return undefined;
    return { locationId: locationFilterId, status: 'IN_STOCK' as const };
  }, [locationFilterId]);

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
    if (!selectedContainer) return;
    form.setValue('lotId', selectedContainer.lot_id);
    if (selectedItem?.base_uom) {
      form.setValue('uom', selectedItem.base_uom);
    }
  }, [selectedContainer, selectedItem, form]);

  const balanceFilters = useMemo(() => {
    if (!selectedHolderId || !selectedItemId) return undefined;
    return {
      holderType: selectedHolderType as InventoryHolderType,
      holderId: selectedHolderId,
      itemId: selectedItemId,
    };
  }, [selectedHolderId, selectedHolderType, selectedItemId]);

  const { data: balances = [] } = useConsumableBalances(balanceFilters);
  const availableQty = balances.reduce((total, balance) => total + (balance.qty_on_hand_base || 0), 0);

  const selectedItemAvailableQty = selectedItem ? availableByItemId.get(selectedItem.id) || 0 : 0;
  const selectedHolder = holderOptions.find((holder) => holder.id === selectedHolderId);

  const handleSubmit = async (data: ConsumeFormData) => {
    if (requiresContainer && data.holderType !== 'OFFICE') {
      form.setError('holderType', {
        message: 'Container-tracked items can only be consumed from office storage',
      });
      return;
    }
    if (requiresContainer && !data.containerId) {
      form.setError('containerId', { message: 'Container is required for this item' });
      return;
    }
    await consumeMutation.mutateAsync({
      holderType: data.holderType,
      holderId: data.holderId,
      itemId: data.itemId,
      lotId: data.lotId && data.lotId !== FEFO_VALUE ? data.lotId : undefined,
      containerId: data.containerId || undefined,
      qty: data.qty,
      uom: data.uom,
      reference: data.reference || undefined,
      notes: data.notes || undefined,
    });
    form.reset({
      locationId: data.locationId,
      holderType: data.holderType,
      holderId: data.holderId,
      itemId: '',
      lotId: FEFO_VALUE,
      containerId: '',
      qty: 0,
      uom: '',
      reference: '',
      notes: '',
    });
  };

  return (
    <MainLayout title="Consumable Consumption" description="Record lab consumption">
      <PageHeader
        title="Consumption"
        description="Record consumable usage"
        extra={<ConsumableModeToggle mode={mode} onChange={setMode} />}
      />

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Lab Location *</Label>
                {role === 'org_admin' ? (
                  <Select value={selectedLocationId} onValueChange={(v) => form.setValue('locationId', v)}>
                    <SelectTrigger><SelectValue placeholder="Select lab" /></SelectTrigger>
                    <SelectContent>
                      {filteredLocations.map((loc) => (
                        <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                    {selectedLocation?.name || 'Assigned Lab'}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Holder Type *</Label>
                <Select
                  value={selectedHolderType}
                  onValueChange={(value) => {
                    form.setValue('holderType', value as ConsumeHolderType);
                    form.setValue('holderId', '');
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select holder type" /></SelectTrigger>
                  <SelectContent>
                    {holderTypeOptions.includes('OFFICE') && (
                      <SelectItem value="OFFICE">Office Storage</SelectItem>
                    )}
                    {holderTypeOptions.includes('SUB_LOCATION') && (
                      <SelectItem value="SUB_LOCATION">Section / Room</SelectItem>
                    )}
                    {holderTypeOptions.includes('EMPLOYEE') && (
                      <SelectItem value="EMPLOYEE">Employee</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {form.formState.errors.holderType && (
                  <p className="text-sm text-destructive">{form.formState.errors.holderType.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Holder *</Label>
                <Select value={selectedHolderId} onValueChange={(v) => form.setValue('holderId', v)}>
                  <SelectTrigger><SelectValue placeholder="Select holder" /></SelectTrigger>
                  <SelectContent>
                    {holderOptions.map((holder) => (
                      <SelectItem key={`${holder.holderType}:${holder.id}`} value={holder.id}>
                        {holder.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedHolder && (
                  <p className="text-xs text-muted-foreground">
                    Selected: {selectedHolder.label}
                  </p>
                )}
                {form.formState.errors.holderId && (
                  <p className="text-sm text-destructive">{form.formState.errors.holderId.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Item *</Label>
                <Popover open={itemPickerOpen} onOpenChange={setItemPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between">
                      {selectedItem
                        ? `${selectedItem.name} (${selectedItemAvailableQty} ${selectedItem.base_uom})`
                        : 'Search item by name...'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Type item name..." />
                      <CommandList>
                        <CommandEmpty>No in-stock items found for this holder.</CommandEmpty>
                        {filteredItems.map((item) => (
                          <CommandItem
                            key={item.id}
                            value={`${item.name} ${item.base_uom}`}
                            onSelect={() => {
                              form.setValue('itemId', item.id);
                              setItemPickerOpen(false);
                            }}
                          >
                            <span className="font-medium">{item.name}</span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              {availableByItemId.get(item.id) || 0} {item.base_uom}
                            </span>
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
                <Label htmlFor="reference">Reference</Label>
                <Input id="reference" {...form.register('reference')} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
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

              <div className="space-y-2">
                <Label htmlFor="uom">UoM *</Label>
                <Select value={selectedUom} onValueChange={(v) => form.setValue('uom', v)}>
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
            </div>

            {requiresContainer && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Container *</Label>
                  <Select
                    value={selectedContainerId || ''}
                    onValueChange={(v) => form.setValue('containerId', v)}
                    disabled={selectedHolderType !== 'OFFICE'}
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
                  {selectedHolderType !== 'OFFICE' && (
                    <p className="text-xs text-muted-foreground">
                      Container-tracked items can only be consumed from office storage.
                    </p>
                  )}
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="qty">Quantity *</Label>
                <Input id="qty" type="number" min={0} step="0.01" {...form.register('qty')} />
                {form.formState.errors.qty && (
                  <p className="text-sm text-destructive">{form.formState.errors.qty.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Remarks *</Label>
                <Input id="notes" {...form.register('notes')} />
                {form.formState.errors.notes && (
                  <p className="text-sm text-destructive">{form.formState.errors.notes.message}</p>
                )}
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
