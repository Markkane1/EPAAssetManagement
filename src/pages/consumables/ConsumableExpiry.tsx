import { useEffect, useState } from 'react';
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
import { useConsumableExpiry } from '@/hooks/useConsumableInventory';
import { useConsumableItems } from '@/hooks/useConsumableItems';
import { useConsumableLocations } from '@/hooks/useConsumableLocations';
import { useConsumableLots } from '@/hooks/useConsumableLots';
import type { ConsumableExpiryRow } from '@/types';
import { useConsumableMode } from '@/hooks/useConsumableMode';
import { filterItemsByMode, filterLocationsByMode } from '@/lib/consumableMode';
import { ConsumableModeToggle } from '@/components/consumables/ConsumableModeToggle';

export default function ConsumableExpiry() {
  const ALL_VALUE = '__all__';
  const [days, setDays] = useState(30);
  const [locationId, setLocationId] = useState(ALL_VALUE);

  const { mode, setMode } = useConsumableMode();
  const { data: items } = useConsumableItems();
  const { data: locations } = useConsumableLocations({
    capability: mode === 'chemicals' ? 'chemicals' : 'consumables',
  });
  const { data: lots } = useConsumableLots();
  const { data: expiry = [] } = useConsumableExpiry(
    days,
    locationId !== ALL_VALUE ? locationId : undefined
  );

  const filteredItems = filterItemsByMode(items || [], mode);
  const filteredLocations = filterLocationsByMode(locations || [], mode);
  const visibleExpiry = expiry.filter((row) =>
    filteredItems.some((item) => item.id === row.itemId)
  );

  useEffect(() => {
    if (locationId !== ALL_VALUE && !filteredLocations.some((loc) => loc.id === locationId)) {
      setLocationId(ALL_VALUE);
    }
  }, [locationId, filteredLocations, ALL_VALUE]);

  const columns = [
    {
      key: 'lotId',
      label: 'Lot',
      render: (value: string) => lots?.find((lot) => lot.id === value)?.lot_number || 'Unknown',
    },
    {
      key: 'itemId',
      label: 'Item',
      render: (value: string) => filteredItems.find((item) => item.id === value)?.name || 'Unknown',
    },
    {
      key: 'locationId',
      label: 'Location',
      render: (value: string) => filteredLocations.find((loc) => loc.id === value)?.name || 'Unknown',
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
      <PageHeader
        title="Expiry Dashboard"
        description="Expiring lots in the next 30/60/90 days"
        extra={<ConsumableModeToggle mode={mode} onChange={setMode} />}
      />

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 gap-4">
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
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger><SelectValue placeholder="All locations" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>All locations</SelectItem>
                  {filteredLocations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={visibleExpiry as any}
        searchPlaceholder="Search expiring lots..."
      />
    </MainLayout>
  );
}
