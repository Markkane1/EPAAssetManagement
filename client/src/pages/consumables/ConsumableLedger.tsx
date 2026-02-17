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
import { useOffices } from '@/hooks/useOffices';
import { useEmployees } from '@/hooks/useEmployees';
import { useOfficeSubLocations } from '@/hooks/useOfficeSubLocations';
import { useConsumableLots } from '@/hooks/useConsumableLots';
import type { ConsumableInventoryTransaction } from '@/types';
import { useConsumableMode } from '@/hooks/useConsumableMode';
import { filterItemsByMode, filterLocationsByMode } from '@/lib/consumableMode';
import { ConsumableModeToggle } from '@/components/consumables/ConsumableModeToggle';
import { useAuth } from '@/contexts/AuthContext';

function asId(value: { id?: string; _id?: string }) {
  return value.id || value._id || '';
}

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

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [locationId, setLocationId] = useState(ALL_VALUE);
  const [itemId, setItemId] = useState(ALL_VALUE);
  const [lotId, setLotId] = useState(ALL_VALUE);
  const [txType, setTxType] = useState(ALL_VALUE);
  const [holderTypeFilter, setHolderTypeFilter] = useState(ALL_VALUE);
  const [holderIdFilter, setHolderIdFilter] = useState(ALL_VALUE);

  const ledgerFilters = useMemo(() => {
    const filters: any = {};
    if (from) filters.from = from;
    if (to) filters.to = to;
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
    if (txType !== ALL_VALUE) filters.txType = txType;
    return filters;
  }, [from, to, holderTypeFilter, holderIdFilter, locationId, itemId, lotId, txType, ALL_VALUE, STORE_FILTER, STORE_CODE]);

  const filteredItems = useMemo(() => filterItemsByMode(items || [], mode), [items, mode]);
  const filteredLocations = useMemo(() => filterLocationsByMode(locations || [], mode), [locations, mode]);
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
  const allowedItemIds = useMemo(
    () => new Set(filteredItems.map((item) => item.id)),
    [filteredItems]
  );

  useEffect(() => {
    if (role === 'org_admin') return;
    if (!assignedLocationId) return;
    if (locationId !== assignedLocationId) {
      setLocationId(assignedLocationId);
    }
  }, [role, assignedLocationId, locationId]);

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

  const { data: ledger = [] } = useConsumableLedger(ledgerFilters);
  const isHolderInOffice = useMemo(
    () =>
      (holderType: string | null | undefined, holderId: string | null | undefined, officeId: string) => {
        if (!holderType || !holderId) return false;
        if (holderType === 'OFFICE') return holderId === officeId;
        if (holderType === 'EMPLOYEE') return employeeOfficeMap.get(holderId) === officeId;
        if (holderType === 'SUB_LOCATION') return sectionOfficeMap.get(holderId) === officeId;
        return false;
      },
    [employeeOfficeMap, sectionOfficeMap]
  );
  const formatHolderLabel = useMemo(
    () =>
      (holderType: string | null | undefined, holderId: string | null | undefined) => {
        if (!holderType || !holderId) return 'N/A';
        if (holderType === 'STORE') return 'Head Office Store';
        if (holderType === 'EMPLOYEE') return `${employeeNameMap.get(holderId) || 'Unknown Employee'} (Employee)`;
        if (holderType === 'SUB_LOCATION') return `${sectionNameMap.get(holderId) || 'Unknown Section'} (Section)`;
        return filteredLocations.find((loc) => loc.id === holderId)?.name || 'Unknown Office';
      },
    [employeeNameMap, sectionNameMap, filteredLocations]
  );

  const visibleLedger = ledger.filter((entry) => {
    if (!filteredItems.some((item) => item.id === entry.consumable_item_id)) return false;
    if (holderTypeFilter !== ALL_VALUE && holderIdFilter !== ALL_VALUE) {
      return (
        (entry.from_holder_type === holderTypeFilter && entry.from_holder_id === holderIdFilter) ||
        (entry.to_holder_type === holderTypeFilter && entry.to_holder_id === holderIdFilter)
      );
    }
    if (locationId === ALL_VALUE) return true;
    if (locationId === STORE_FILTER) {
      return entry.from_holder_type === 'STORE' || entry.to_holder_type === 'STORE';
    }
    return (
      isHolderInOffice(entry.from_holder_type, entry.from_holder_id, locationId) ||
      isHolderInOffice(entry.to_holder_type, entry.to_holder_id, locationId)
    );
  });

  useEffect(() => {
    if (itemId !== ALL_VALUE && !filteredItems.some((item) => item.id === itemId)) {
      setItemId(ALL_VALUE);
      setLotId(ALL_VALUE);
    }
    if (locationId !== ALL_VALUE && locationId !== STORE_FILTER && !filteredLocations.some((loc) => loc.id === locationId)) {
      if (role !== 'org_admin' && assignedLocationId) {
        setLocationId(assignedLocationId);
      } else {
        setLocationId(ALL_VALUE);
      }
    }
  }, [itemId, locationId, filteredItems, filteredLocations, role, assignedLocationId, ALL_VALUE, STORE_FILTER]);

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
      render: (value: string | null) => value ? lots?.find((lot) => lot.id === value)?.batch_no || 'Unknown' : 'N/A',
    },
    {
      key: 'from_holder_id',
      label: 'From',
      render: (_value: string | null, row: ConsumableInventoryTransaction) => {
        return formatHolderLabel(row.from_holder_type, row.from_holder_id);
      },
    },
    {
      key: 'to_holder_id',
      label: 'To',
      render: (_value: string | null, row: ConsumableInventoryTransaction) => {
        return formatHolderLabel(row.to_holder_type, row.to_holder_id);
      },
    },
    { key: 'qty_base', label: 'Qty (base)' },
  ];

  const handleExport = () => {
    const rows = visibleLedger.map((row) => ({
      date: row.tx_time,
      type: row.tx_type,
      item: filteredItems.find((item) => item.id === row.consumable_item_id)?.name || row.consumable_item_id,
      lot: row.lot_id ? lots?.find((lot) => lot.id === row.lot_id)?.batch_no || row.lot_id : '',
      from: formatHolderLabel(row.from_holder_type, row.from_holder_id),
      to: formatHolderLabel(row.to_holder_type, row.to_holder_id),
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
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
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
        data={visibleLedger as ConsumableInventoryTransaction[] as any}
        searchPlaceholder="Search ledger..."
        virtualized
      />
    </MainLayout>
  );
}


