import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useConsumableBalances, useConsumableLedger } from '@/hooks/useConsumableInventory';
import { useConsumableItems } from '@/hooks/useConsumableItems';
import { useOffices } from '@/hooks/useOffices';
import { useEmployees } from '@/hooks/useEmployees';
import { useOfficeSubLocations } from '@/hooks/useOfficeSubLocations';
import { useConsumableLots } from '@/hooks/useConsumableLots';
import { consumableInventoryService } from '@/services/consumableInventoryService';
import type { ConsumableInventoryBalance } from '@/types';
import { useConsumableMode } from '@/hooks/useConsumableMode';
import { filterItemsByMode, filterLocationsByMode } from '@/lib/consumableMode';
import { ConsumableModeToggle } from '@/components/consumables/ConsumableModeToggle';
import { useAuth } from '@/contexts/AuthContext';

function asId(value: { id?: string; _id?: string }) {
  return value.id || value._id || '';
}

export default function ConsumableInventory() {
  const ALL_VALUE = '__all__';
  const STORE_FILTER = '__store__';
  const STORE_CODE = 'HEAD_OFFICE_STORE';
  const { role, locationId: assignedLocationId } = useAuth();
  const { mode, setMode } = useConsumableMode();
  const { data: items } = useConsumableItems();
  const { data: locations } = useOffices({
    capability: mode === 'chemicals' ? 'chemicals' : 'consumables',
  });
  const { data: employees = [] } = useEmployees();
  const { data: sections = [] } = useOfficeSubLocations();
  const { data: lots } = useConsumableLots();

  const [locationId, setLocationId] = useState(ALL_VALUE);
  const [itemId, setItemId] = useState(ALL_VALUE);
  const [lotId, setLotId] = useState(ALL_VALUE);
  const [holderTypeFilter, setHolderTypeFilter] = useState(ALL_VALUE);
  const [holderIdFilter, setHolderIdFilter] = useState(ALL_VALUE);

  const filteredItems = useMemo(() => filterItemsByMode(items || [], mode), [items, mode]);
  const filteredLocations = useMemo(() => filterLocationsByMode(locations || [], mode), [locations, mode]);
  const allowedItemIds = useMemo(
    () => new Set(filteredItems.map((item) => item.id)),
    [filteredItems]
  );
  const employeeNameMap = useMemo(
    () =>
      new Map(
        employees.map((employee) => [
          asId(employee),
          `${employee.first_name || ''} ${employee.last_name || ''}`.trim() || employee.email || asId(employee),
        ])
      ),
    [employees]
  );
  const employeeOfficeMap = useMemo(
    () => new Map(employees.map((employee) => [asId(employee), employee.location_id ? String(employee.location_id) : null])),
    [employees]
  );
  const sectionNameMap = useMemo(
    () => new Map(sections.map((section) => [asId(section), section.name])),
    [sections]
  );
  const sectionOfficeMap = useMemo(
    () => new Map(sections.map((section) => [asId(section), section.office_id ? String(section.office_id) : null])),
    [sections]
  );
  
  useEffect(() => {
    if (itemId !== ALL_VALUE && !filteredItems.some((item) => item.id === itemId)) {
      setItemId(ALL_VALUE);
      setLotId(ALL_VALUE);
    }
  }, [itemId, filteredItems, ALL_VALUE]);

  useEffect(() => {
    if (role === 'org_admin') return;
    if (!assignedLocationId) return;
    if (locationId !== assignedLocationId) {
      setLocationId(assignedLocationId);
    }
  }, [role, assignedLocationId, locationId]);

  useEffect(() => {
    if (locationId !== ALL_VALUE && locationId !== STORE_FILTER && !filteredLocations.some((loc) => loc.id === locationId)) {
      setLocationId(ALL_VALUE);
    }
  }, [locationId, filteredLocations, ALL_VALUE, STORE_FILTER]);

  useEffect(() => {
    setHolderIdFilter(ALL_VALUE);
  }, [holderTypeFilter, ALL_VALUE]);

  const holderOptions = useMemo(() => {
    if (holderTypeFilter === 'STORE') {
      return [{ id: STORE_CODE, label: 'Head Office Store' }];
    }
    if (holderTypeFilter === 'OFFICE') {
      const officeOptions =
        locationId !== ALL_VALUE && locationId !== STORE_FILTER
          ? filteredLocations.filter((location) => location.id === locationId)
          : filteredLocations;
      return officeOptions.map((location) => ({ id: location.id, label: location.name }));
    }
    if (holderTypeFilter === 'EMPLOYEE') {
      return employees
        .filter((employee) => {
          if (locationId === ALL_VALUE || locationId === STORE_FILTER) return true;
          return employee.location_id ? String(employee.location_id) === locationId : false;
        })
        .map((employee) => {
          const employeeId = asId(employee);
          return {
            id: employeeId,
            label: `${employee.first_name || ''} ${employee.last_name || ''}`.trim() || employee.email || employeeId,
          };
        })
        .filter((employee) => employee.id);
    }
    if (holderTypeFilter === 'SUB_LOCATION') {
      return sections
        .filter((section) => {
          const officeId = section.office_id ? String(section.office_id) : null;
          if (locationId === ALL_VALUE || locationId === STORE_FILTER) return true;
          return officeId === locationId;
        })
        .map((section) => ({ id: asId(section), label: section.name }))
        .filter((section) => section.id);
    }
    return [];
  }, [holderTypeFilter, locationId, filteredLocations, employees, sections, ALL_VALUE, STORE_FILTER, STORE_CODE]);

  const balanceFilters = useMemo(() => {
    const filters: any = {};
    if (holderTypeFilter !== ALL_VALUE && holderIdFilter !== ALL_VALUE) {
      filters.holderType = holderTypeFilter;
      filters.holderId = holderIdFilter;
    } else if (locationId === STORE_FILTER) {
      filters.holderType = 'STORE';
      filters.holderId = STORE_CODE;
    } else if (locationId !== ALL_VALUE) {
      filters.holderType = 'OFFICE';
      filters.holderId = locationId;
    }
    if (itemId !== ALL_VALUE) filters.itemId = itemId;
    if (lotId !== ALL_VALUE) filters.lotId = lotId;
    return Object.keys(filters).length ? filters : undefined;
  }, [holderTypeFilter, holderIdFilter, locationId, itemId, lotId, ALL_VALUE, STORE_FILTER, STORE_CODE]);

  const { data: balances = [] } = useConsumableBalances(balanceFilters);

  const { data: rollup } = useQuery({
    queryKey: ['consumableRollup', itemId !== ALL_VALUE ? itemId : 'all'],
    queryFn: () => consumableInventoryService.getRollup(itemId !== ALL_VALUE ? itemId : undefined),
    enabled: itemId !== ALL_VALUE,
  });

  const { data: ledger = [] } = useConsumableLedger(itemId !== ALL_VALUE ? { itemId } : undefined);

  const visibleBalances = useMemo(
    () =>
      (balances || []).filter((balance) => {
        if (!filteredItems.some((item) => item.id === balance.consumable_item_id)) return false;
        if (holderTypeFilter !== ALL_VALUE && holderIdFilter !== ALL_VALUE) {
          return balance.holder_type === holderTypeFilter && balance.holder_id === holderIdFilter;
        }
        if (locationId === ALL_VALUE) return true;
        if (locationId === STORE_FILTER) return balance.holder_type === 'STORE';
        if (balance.holder_type === 'OFFICE') return balance.holder_id === locationId;
        if (balance.holder_type === 'EMPLOYEE') {
          return balance.holder_id ? employeeOfficeMap.get(String(balance.holder_id)) === locationId : false;
        }
        if (balance.holder_type === 'SUB_LOCATION') {
          return balance.holder_id ? sectionOfficeMap.get(String(balance.holder_id)) === locationId : false;
        }
        return false;
      }),
    [balances, filteredItems, holderTypeFilter, holderIdFilter, locationId, ALL_VALUE, STORE_FILTER, employeeOfficeMap, sectionOfficeMap]
  );

  const columns = [
    {
      key: 'consumable_item_id',
      label: 'Item',
      render: (value: string) => filteredItems.find((item) => item.id === value)?.name || 'Unknown',
    },
    {
      key: 'holder_id',
      label: 'Holder',
      render: (_: string, row: ConsumableInventoryBalance) => {
        if (row.holder_type === 'STORE') return 'Head Office Store';
        if (row.holder_type === 'EMPLOYEE') {
          return row.holder_id ? `${employeeNameMap.get(String(row.holder_id)) || 'Unknown Employee'} (Employee)` : 'Unknown';
        }
        if (row.holder_type === 'SUB_LOCATION') {
          return row.holder_id ? `${sectionNameMap.get(String(row.holder_id)) || 'Unknown Section'} (Section)` : 'Unknown';
        }
        const officeId = row.holder_id || '';
        return filteredLocations.find((loc) => loc.id === officeId)?.name || 'Unknown Office';
      },
    },
    {
      key: 'lot_id',
      label: 'Lot',
      render: (value: string | null, row: ConsumableInventoryBalance) => {
        if (!value) {
          if ((row.lot_count || 0) > 0) {
            return `Combined (${row.lot_count} lots)`;
          }
          return 'N/A';
        }
        return lots?.find((lot) => lot.id === value)?.batch_no || 'Unknown';
      },
    },
    {
      key: 'qty_on_hand_base',
      label: 'On Hand (base)',
      render: (value: number, row: ConsumableInventoryBalance) => {
        const item = filteredItems.find((i) => i.id === row.consumable_item_id);
        return (
          <span className="font-medium">{value} {item?.base_uom || ''}</span>
        );
      },
    },
  ];

  return (
    <MainLayout title="Consumable Inventory" description="Central and lab inventory view">
      <PageHeader
        title="Inventory"
        description="View balances by location, item, and lot"
        extra={<ConsumableModeToggle mode={mode} onChange={setMode} />}
      />

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <div className="space-y-2">
              <label className="text-sm font-medium">Location</label>
              {role === 'org_admin' ? (
                <Select value={locationId} onValueChange={setLocationId}>
                  <SelectTrigger><SelectValue placeholder="All locations" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_VALUE}>All locations</SelectItem>
                    <SelectItem value={STORE_FILTER}>Head Office Store</SelectItem>
                    {filteredLocations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  {filteredLocations.find((loc) => loc.id === locationId)?.name || 'Assigned location'}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Item</label>
              <Select value={itemId} onValueChange={(value) => { setItemId(value); setLotId(ALL_VALUE); }}>
                <SelectTrigger><SelectValue placeholder="All items" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>All items</SelectItem>
                  {filteredItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Lot</label>
              <Select value={lotId} onValueChange={setLotId}>
                <SelectTrigger><SelectValue placeholder="All lots" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>All lots</SelectItem>
                  {(lots || [])
                    .filter((lot) => {
                      if (itemId !== ALL_VALUE) return lot.consumable_id === itemId;
                      return allowedItemIds.has(lot.consumable_id);
                    })
                    .map((lot) => (
                      <SelectItem key={lot.id} value={lot.id}>{lot.batch_no}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Holder Type (optional)</label>
              <Select value={holderTypeFilter} onValueChange={setHolderTypeFilter}>
                <SelectTrigger><SelectValue placeholder="All holder types" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>All holder types</SelectItem>
                  <SelectItem value="STORE">Store</SelectItem>
                  <SelectItem value="OFFICE">Office</SelectItem>
                  <SelectItem value="SUB_LOCATION">Section / Room</SelectItem>
                  <SelectItem value="EMPLOYEE">Employee</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Holder (optional)</label>
              <Select
                value={holderIdFilter}
                onValueChange={setHolderIdFilter}
                disabled={holderTypeFilter === ALL_VALUE}
              >
                <SelectTrigger><SelectValue placeholder="All holders" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>All holders</SelectItem>
                  {holderOptions.map((holder) => (
                    <SelectItem key={`${holderTypeFilter}-${holder.id}`} value={holder.id}>
                      {holder.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={visibleBalances as any}
        searchPlaceholder="Search inventory..."
      />

      {itemId !== ALL_VALUE && rollup && rollup.length > 0 && (
        <Card className="mt-6">
          <CardContent className="pt-6">
            <h3 className="text-lg font-semibold mb-2">Item Rollup</h3>
            {rollup.map((row: any) => (
              <div key={row.itemId} className="space-y-2">
                <p className="text-sm text-muted-foreground">Total across locations</p>
                <p className="text-2xl font-semibold">
                  {row.totalQtyBase} {filteredItems.find((i) => i.id === row.itemId)?.base_uom}
                </p>
                <div className="flex flex-wrap gap-2">
                  {((row.byHolder && row.byHolder.length > 0) ? row.byHolder : row.byLocation).map((loc: any) => (
                    <Badge key={`${loc.holderType || 'OFFICE'}-${loc.holderId || loc.locationId}`} variant="outline">
                      {(() => {
                        const holderType = loc.holderType || 'OFFICE';
                        const holderId = loc.holderId || loc.locationId;
                        if (holderType === 'STORE') return 'Head Office Store';
                        if (holderType === 'EMPLOYEE') {
                          return `${employeeNameMap.get(String(holderId)) || 'Unknown Employee'} (Employee)`;
                        }
                        if (holderType === 'SUB_LOCATION') {
                          return `${sectionNameMap.get(String(holderId)) || 'Unknown Section'} (Section)`;
                        }
                        return filteredLocations.find((l) => l.id === holderId)?.name || 'Unknown Office';
                      })()}: {loc.qtyOnHandBase}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {itemId !== ALL_VALUE && ledger.length > 0 && (
        <Card className="mt-6">
          <CardContent className="pt-6">
            <h3 className="text-lg font-semibold mb-2">Recent Transactions</h3>
            <div className="space-y-2 text-sm">
            {ledger.slice(0, 5).map((entry) => (
              <div key={entry.id} className="flex items-center justify-between border-b pb-2">
                <div>
                  <p className="font-medium">{entry.tx_type}</p>
                  <p className="text-muted-foreground">{new Date(entry.tx_time).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium">{entry.qty_base} {filteredItems.find((i) => i.id === entry.consumable_item_id)?.base_uom}</p>
                  <p className="text-muted-foreground">{entry.lot_id ? lots?.find((lot) => lot.id === entry.lot_id)?.batch_no : 'No lot'}</p>
                </div>
              </div>
            ))}
            </div>
          </CardContent>
        </Card>
      )}
    </MainLayout>
  );
}

