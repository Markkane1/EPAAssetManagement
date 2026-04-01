import { useEffect, useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { CollectionWorkspace } from '@/components/shared/CollectionWorkspace';
import { DataTable } from '@/components/shared/DataTable';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertTriangle, CalendarClock, MapPin, Package } from 'lucide-react';
import { useConsumableExpiry } from '@/hooks/useConsumableInventory';
import { useConsumableItems } from '@/hooks/useConsumableItems';
import { useOffices } from '@/hooks/useOffices';
import { useEmployees } from '@/hooks/useEmployees';
import { useOfficeSubLocations } from '@/hooks/useOfficeSubLocations';
import { useConsumableLots } from '@/hooks/useConsumableLots';
import type { ConsumableExpiryRow } from '@/types';
import { useConsumableMode } from '@/hooks/useConsumableMode';
import { filterItemsByMode, filterLocationsByMode } from '@/lib/consumableMode';
import { ConsumableModeToggle } from '@/components/consumables/ConsumableModeToggle';
import { SearchableSelect } from '@/components/shared/SearchableSelect';

export default function ConsumableExpiry() {
  const ALL_VALUE = '__all__';
  const [days, setDays] = useState(30);
  const [locationId, setLocationId] = useState(ALL_VALUE);

  const { mode, setMode } = useConsumableMode();
  const { data: items } = useConsumableItems();
  const { data: locations } = useOffices({
    capability: mode === 'chemicals' ? 'chemicals' : 'consumables',
  });
  const { data: employees = [] } = useEmployees();
  const { data: sections = [] } = useOfficeSubLocations();
  const { data: lots } = useConsumableLots();
  const { data: expiry = [] } = useConsumableExpiry(days);

  const filteredItems = filterItemsByMode(items || [], mode);
  const filteredLocations = filterLocationsByMode(locations || [], mode);
  const employeeNameMap = new Map(
    employees.map((employee) => [
      employee.id,
      `${employee.first_name || ''} ${employee.last_name || ''}`.trim() || employee.email || employee.id,
    ])
  );
  const sectionNameMap = new Map(sections.map((section) => [section.id, section.name]));
  const visibleExpiry = expiry.filter((row) => {
    if (!filteredItems.some((item) => item.id === row.itemId)) return false;
    if (locationId === ALL_VALUE) return true;
    return row.locationId === locationId;
  });
  const expiringItemCount = new Set(visibleExpiry.map((row) => row.itemId)).size;
  const expiringLocationCount = new Set(visibleExpiry.map((row) => row.locationId).filter(Boolean)).size;

  useEffect(() => {
    if (locationId !== ALL_VALUE && !filteredLocations.some((loc) => loc.id === locationId)) {
      setLocationId(ALL_VALUE);
    }
  }, [locationId, filteredLocations, ALL_VALUE]);

  const columns = [
    {
      key: 'lotId',
      label: 'Lot',
      render: (value: string) => lots?.find((lot) => lot.id === value)?.batch_no || 'Unknown',
    },
    {
      key: 'itemId',
      label: 'Item',
      render: (value: string) => filteredItems.find((item) => item.id === value)?.name || 'Unknown',
    },
    {
      key: 'holderId',
      label: 'Holder',
      render: (_value: string, row: ConsumableExpiryRow) => {
        if (row.holderType === 'STORE') return 'Head Office Store';
        if (row.holderType === 'EMPLOYEE') {
          return row.holderId ? `${employeeNameMap.get(row.holderId) || 'Unknown Employee'} (Employee)` : 'Unknown';
        }
        if (row.holderType === 'SUB_LOCATION') {
          return row.holderId ? `${sectionNameMap.get(row.holderId) || 'Unknown Section'} (Section)` : 'Unknown';
        }
        const officeId = row.holderId || '';
        return filteredLocations.find((loc) => loc.id === officeId)?.name || 'Unknown Office';
      },
    },
    {
      key: 'expiryDate',
      label: 'Expiry Date',
      render: (value: string) => new Date(value).toLocaleDateString(),
    },
    {
      key: 'qtyOnHandBase',
      label: 'Qty (base)',
      render: (value: number, row: ConsumableExpiryRow) => {
        const item = filteredItems.find((i) => i.id === row.itemId);
        return `${value} ${item?.base_uom || ''}`;
      },
    },
  ];

  return (
    <MainLayout title="Expiry Dashboard" description="Lots nearing expiration">
      <CollectionWorkspace
        title="Expiry Dashboard"
        description="Expiring lots in the next 30/60/90 days"
        eyebrow="Consumables workspace"
        meta={
          <>
            <span>{visibleExpiry.length} expiring balance rows in scope</span>
            <span className="hidden h-1 w-1 rounded-full bg-border sm:inline-block" />
            <span>{mode === 'chemicals' ? 'Chemical expiry watch' : 'General consumable expiry watch'}</span>
          </>
        }
        extra={<ConsumableModeToggle mode={mode} onChange={setMode} />}
        metrics={[
          { label: 'Expiring rows', value: visibleExpiry.length, helper: 'Rows matching the active range and location filter', icon: AlertTriangle, tone: 'warning' },
          { label: 'Days window', value: days, helper: 'Current expiry lookahead window', icon: CalendarClock, tone: 'primary' },
          { label: 'Items', value: expiringItemCount, helper: 'Distinct items with upcoming expiries', icon: Package, tone: 'success' },
          { label: 'Locations', value: expiringLocationCount, helper: 'Locations affected by upcoming expiries', icon: MapPin },
        ]}
        filterBar={
          <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Days</label>
              <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
                <SelectTrigger><SelectValue placeholder="Select range" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="60">60 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Location</label>
              <SearchableSelect
                value={locationId}
                onValueChange={setLocationId}
                placeholder="All locations"
                searchPlaceholder="Search locations..."
                emptyText="No locations found."
                options={[
                  { value: ALL_VALUE, label: 'All locations' },
                  ...filteredLocations.map((loc) => ({ value: loc.id, label: loc.name })),
                ]}
              />
            </div>
          </div>
        }
        panelTitle="Expiry watchlist"
        panelDescription="Track upcoming expiries with the same dashboard-style shell used across the rest of the consumables workspace."
      >

        <DataTable
          columns={columns}
          data={visibleExpiry as any}
          searchPlaceholder="Search expiring lots..."
        />
      </CollectionWorkspace>
    </MainLayout>
  );
}


