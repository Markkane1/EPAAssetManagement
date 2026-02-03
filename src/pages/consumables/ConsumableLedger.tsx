import { useEffect, useMemo, useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useConsumableLedger } from '@/hooks/useConsumableInventory';
import { useConsumableItems } from '@/hooks/useConsumableItems';
import { useConsumableLocations } from '@/hooks/useConsumableLocations';
import { useConsumableLots } from '@/hooks/useConsumableLots';
import type { ConsumableInventoryTransaction } from '@/types';
import { useConsumableMode } from '@/hooks/useConsumableMode';
import { filterItemsByMode, filterLocationsByMode } from '@/lib/consumableMode';
import { ConsumableModeToggle } from '@/components/consumables/ConsumableModeToggle';

const txTypes = ['RECEIPT', 'TRANSFER', 'CONSUME', 'ADJUST', 'DISPOSE', 'RETURN', 'OPENING_BALANCE'];

function toCsv(rows: any[], columns: string[]) {
  const header = columns.join(',');
  const lines = rows.map((row) =>
    columns.map((key) => `"${String(row[key] ?? '').replace(/"/g, '""')}"`).join(',')
  );
  return [header, ...lines].join('\n');
}

export default function ConsumableLedger() {
  const ALL_VALUE = '__all__';
  const { mode, setMode } = useConsumableMode();
  const { data: items } = useConsumableItems();
  const { data: locations } = useConsumableLocations({
    capability: mode === 'chemicals' ? 'chemicals' : 'consumables',
  });
  const { data: lots } = useConsumableLots();

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [locationId, setLocationId] = useState(ALL_VALUE);
  const [itemId, setItemId] = useState(ALL_VALUE);
  const [lotId, setLotId] = useState(ALL_VALUE);
  const [txType, setTxType] = useState(ALL_VALUE);

  const ledgerFilters = useMemo(() => {
    const filters: any = {};
    if (from) filters.from = from;
    if (to) filters.to = to;
    if (locationId !== ALL_VALUE) filters.locationId = locationId;
    if (itemId !== ALL_VALUE) filters.itemId = itemId;
    if (lotId !== ALL_VALUE) filters.lotId = lotId;
    if (txType !== ALL_VALUE) filters.txType = txType;
    return filters;
  }, [from, to, locationId, itemId, lotId, txType, ALL_VALUE]);

  const filteredItems = useMemo(() => filterItemsByMode(items || [], mode), [items, mode]);
  const filteredLocations = useMemo(() => filterLocationsByMode(locations || [], mode), [locations, mode]);
  const allowedItemIds = useMemo(
    () => new Set(filteredItems.map((item) => item.id)),
    [filteredItems]
  );

  const { data: ledger = [] } = useConsumableLedger(ledgerFilters);
  const visibleLedger = ledger.filter((entry) =>
    filteredItems.some((item) => item.id === entry.consumable_item_id)
  );

  useEffect(() => {
    if (itemId !== ALL_VALUE && !filteredItems.some((item) => item.id === itemId)) {
      setItemId(ALL_VALUE);
      setLotId(ALL_VALUE);
    }
    if (locationId !== ALL_VALUE && !filteredLocations.some((loc) => loc.id === locationId)) {
      setLocationId(ALL_VALUE);
    }
  }, [itemId, locationId, filteredItems, filteredLocations, ALL_VALUE]);

  const columns = [
    { key: 'tx_time', label: 'Date' },
    { key: 'tx_type', label: 'Type' },
    {
      key: 'consumable_item_id',
      label: 'Item',
      render: (value: string) => filteredItems.find((item) => item.id === value)?.name || 'Unknown',
    },
    {
      key: 'lot_id',
      label: 'Lot',
      render: (value: string | null) => value ? lots?.find((lot) => lot.id === value)?.lot_number || 'Unknown' : 'N/A',
    },
    {
      key: 'from_location_id',
      label: 'From',
      render: (value: string | null) =>
        value ? filteredLocations.find((loc) => loc.id === value)?.name || 'Unknown' : 'N/A',
    },
    {
      key: 'to_location_id',
      label: 'To',
      render: (value: string | null) =>
        value ? filteredLocations.find((loc) => loc.id === value)?.name || 'Unknown' : 'N/A',
    },
    { key: 'qty_base', label: 'Qty (base)' },
  ];

  const handleExport = () => {
    const rows = visibleLedger.map((row) => ({
      date: row.tx_time,
      type: row.tx_type,
      item: filteredItems.find((item) => item.id === row.consumable_item_id)?.name || row.consumable_item_id,
      lot: row.lot_id ? lots?.find((lot) => lot.id === row.lot_id)?.lot_number || row.lot_id : '',
      from: row.from_location_id ? filteredLocations.find((loc) => loc.id === row.from_location_id)?.name || row.from_location_id : '',
      to: row.to_location_id ? filteredLocations.find((loc) => loc.id === row.to_location_id)?.name || row.to_location_id : '',
      qty_base: row.qty_base,
      entered_qty: row.entered_qty,
      entered_uom: row.entered_uom,
      reason: row.reason_code_id || '',
      reference: row.reference || '',
    }));

    const csv = toCsv(rows, ['date', 'type', 'item', 'lot', 'from', 'to', 'qty_base', 'entered_qty', 'entered_uom', 'reason', 'reference']);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'consumable-ledger.csv');
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <MainLayout title="Consumable Ledger" description="Transaction history">
      <PageHeader
        title="Ledger"
        description="Filterable transaction history"
        extra={
          <div className="flex items-center gap-2">
            <ConsumableModeToggle mode={mode} onChange={setMode} />
            <Button variant="outline" onClick={handleExport}>Export CSV</Button>
          </div>
        }
      />

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">From</label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">To</label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Type</label>
              <Select value={txType} onValueChange={setTxType}>
                <SelectTrigger><SelectValue placeholder="All types" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>All types</SelectItem>
                  {txTypes.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
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
            <div className="space-y-2">
              <label className="text-sm font-medium">Item</label>
              <Select value={itemId} onValueChange={setItemId}>
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
                      if (itemId !== ALL_VALUE) return lot.consumable_item_id === itemId;
                      return allowedItemIds.has(lot.consumable_item_id);
                    })
                    .map((lot) => (
                      <SelectItem key={lot.id} value={lot.id}>{lot.lot_number}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={visibleLedger as ConsumableInventoryTransaction[] as any}
        searchPlaceholder="Search ledger..."
      />
    </MainLayout>
  );
}

