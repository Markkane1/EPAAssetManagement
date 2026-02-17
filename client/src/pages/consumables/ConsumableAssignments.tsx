import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
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
import { useAuth } from '@/contexts/AuthContext';
import { useConsumableMode } from '@/hooks/useConsumableMode';
import { ConsumableModeToggle } from '@/components/consumables/ConsumableModeToggle';
import { filterItemsByMode, filterLocationsByMode } from '@/lib/consumableMode';
import { useConsumableItems } from '@/hooks/useConsumableItems';
import { useOffices } from '@/hooks/useOffices';
import { useEmployees } from '@/hooks/useEmployees';
import { useOfficeSubLocations } from '@/hooks/useOfficeSubLocations';
import { useConsumableLots } from '@/hooks/useConsumableLots';
import {
  useConsumableBalances,
  useConsumableLedger,
  useTransferConsumables,
} from '@/hooks/useConsumableInventory';
import { useConsumableUnits } from '@/hooks/useConsumableUnits';
import { getCompatibleUnits } from '@/lib/unitUtils';
import type { ConsumableItem, ConsumableInventoryTransaction } from '@/types';

const FEFO_VALUE = '__fefo__';
const assigneeTypeSchema = z.enum(['EMPLOYEE', 'SUB_LOCATION']);

const assignmentSchema = z.object({
  sourceOfficeId: z.string().min(1, 'Source office is required'),
  assigneeType: assigneeTypeSchema,
  assigneeId: z.string().min(1, 'Assignee is required'),
  itemId: z.string().min(1, 'Item is required'),
  lotId: z.string().optional(),
  qty: z.coerce.number().positive('Quantity must be greater than zero'),
  uom: z.string().min(1, 'Unit is required'),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

type AssignmentFormData = z.infer<typeof assignmentSchema>;
type AssigneeType = z.infer<typeof assigneeTypeSchema>;

type AssigneeOption = {
  id: string;
  label: string;
  type: AssigneeType;
};

function asId<T extends { id?: string; _id?: string }>(row: T): string {
  return String(row.id || row._id || '');
}

export default function ConsumableAssignments() {
  const { role, locationId } = useAuth();
  const { mode, setMode } = useConsumableMode();
  const { data: items } = useConsumableItems();
  const { data: locations } = useOffices({
    capability: mode === 'chemicals' ? 'chemicals' : 'consumables',
  });
  const { data: employees = [] } = useEmployees();
  const { data: lots } = useConsumableLots();
  const { data: units } = useConsumableUnits();
  const transferMutation = useTransferConsumables();

  const form = useForm<AssignmentFormData>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: {
      sourceOfficeId: locationId || '',
      assigneeType: 'EMPLOYEE',
      assigneeId: '',
      itemId: '',
      lotId: FEFO_VALUE,
      qty: 0,
      uom: '',
      reference: '',
      notes: '',
    },
  });

  const filteredLocations = useMemo(() => filterLocationsByMode(locations || [], mode), [locations, mode]);
  const modeFilteredItems = useMemo(() => filterItemsByMode(items || [], mode), [items, mode]);
  const unitList = useMemo(() => units || [], [units]);

  const sourceOfficeId = form.watch('sourceOfficeId');
  const assigneeType = form.watch('assigneeType');
  const assigneeId = form.watch('assigneeId');
  const itemId = form.watch('itemId');
  const lotId = form.watch('lotId');
  const uom = form.watch('uom');

  const { data: sections = [] } = useOfficeSubLocations({ officeId: sourceOfficeId || undefined });

  useEffect(() => {
    if (role !== 'org_admin') {
      if (locationId && form.getValues('sourceOfficeId') !== locationId) {
        form.setValue('sourceOfficeId', locationId);
      }
      return;
    }
    if (!filteredLocations.length) return;
    const current = form.getValues('sourceOfficeId');
    if (!current || !filteredLocations.some((office) => office.id === current)) {
      form.setValue('sourceOfficeId', filteredLocations[0].id);
    }
  }, [role, locationId, filteredLocations, form]);

  const officeBalancesFilters = useMemo(() => {
    if (!sourceOfficeId) return undefined;
    return {
      holderType: 'OFFICE' as const,
      holderId: sourceOfficeId,
    };
  }, [sourceOfficeId]);
  const { data: officeBalances = [] } = useConsumableBalances(officeBalancesFilters);

  const availableByItemId = useMemo(() => {
    const map = new Map<string, number>();
    officeBalances.forEach((balance) => {
      map.set(
        balance.consumable_item_id,
        (map.get(balance.consumable_item_id) || 0) + (balance.qty_on_hand_base || 0)
      );
    });
    return map;
  }, [officeBalances]);

  const filteredItems = useMemo(
    () => modeFilteredItems.filter((item) => (availableByItemId.get(item.id) || 0) > 0),
    [modeFilteredItems, availableByItemId]
  );

  const selectedItem: ConsumableItem | undefined = useMemo(
    () => filteredItems.find((item) => item.id === itemId),
    [filteredItems, itemId]
  );

  const compatibleUnits = useMemo(() => {
    if (!selectedItem) return [] as string[];
    const resolved = getCompatibleUnits(selectedItem.base_uom, unitList);
    if (!resolved.length) return [selectedItem.base_uom];
    if (!resolved.includes(selectedItem.base_uom)) return [selectedItem.base_uom, ...resolved];
    return resolved;
  }, [selectedItem, unitList]);

  useEffect(() => {
    const currentItem = form.getValues('itemId');
    if (currentItem && !filteredItems.some((item) => item.id === currentItem)) {
      form.setValue('itemId', '');
      form.setValue('lotId', FEFO_VALUE);
      form.setValue('uom', '');
    }
  }, [filteredItems, form]);

  useEffect(() => {
    if (selectedItem && !form.getValues('uom')) {
      form.setValue('uom', selectedItem.base_uom);
    }
  }, [selectedItem, form]);

  const assigneeOptions = useMemo<AssigneeOption[]>(() => {
    if (!sourceOfficeId) return [];
    if (assigneeType === 'EMPLOYEE') {
      return employees
        .filter(
          (employee) =>
            employee.is_active !== false &&
            employee.location_id &&
            String(employee.location_id) === sourceOfficeId
        )
        .map((employee) => ({
          id: asId(employee),
          type: 'EMPLOYEE' as const,
          label: `${employee.first_name || ''} ${employee.last_name || ''}`.trim() || employee.email,
        }))
        .filter((option) => option.id);
    }
    return sections.map((section) => ({
      id: asId(section),
      type: 'SUB_LOCATION' as const,
      label: section.name,
    })).filter((option) => option.id);
  }, [assigneeType, sourceOfficeId, employees, sections]);

  useEffect(() => {
    if (!assigneeOptions.length) {
      form.setValue('assigneeId', '');
      return;
    }
    const current = form.getValues('assigneeId');
    if (!current || !assigneeOptions.some((option) => option.id === current)) {
      form.setValue('assigneeId', assigneeOptions[0].id);
    }
  }, [assigneeOptions, form]);

  const availableQty = itemId ? availableByItemId.get(itemId) || 0 : 0;

  const handleSubmit = async (data: AssignmentFormData) => {
    if (!filteredLocations.some((office) => office.id === data.sourceOfficeId)) {
      form.setError('sourceOfficeId', { message: 'Selected source office is invalid.' });
      return;
    }
    if (!assigneeOptions.some((option) => option.id === data.assigneeId)) {
      form.setError('assigneeId', { message: 'Selected assignee is invalid or no longer available.' });
      return;
    }
    if (!filteredItems.some((item) => item.id === data.itemId)) {
      form.setError('itemId', { message: 'Selected item is invalid or no longer available.' });
      return;
    }

    if (availableQty > 0 && data.qty > availableQty) {
      form.setError('qty', { message: `Available stock is ${availableQty} ${selectedItem?.base_uom || ''}` });
      return;
    }

    await transferMutation.mutateAsync({
      fromHolderType: 'OFFICE',
      fromHolderId: data.sourceOfficeId,
      toHolderType: data.assigneeType,
      toHolderId: data.assigneeId,
      itemId: data.itemId,
      lotId: data.lotId && data.lotId !== FEFO_VALUE ? data.lotId : undefined,
      qty: data.qty,
      uom: data.uom,
      reference: data.reference || undefined,
      notes: data.notes || undefined,
    });

    form.reset({
      sourceOfficeId: data.sourceOfficeId,
      assigneeType: data.assigneeType,
      assigneeId: data.assigneeId,
      itemId: '',
      lotId: FEFO_VALUE,
      qty: 0,
      uom: '',
      reference: '',
      notes: '',
    });
  };

  const ledgerFilters = useMemo(
    () => ({
      txType: 'TRANSFER',
      holderType: 'OFFICE' as const,
      holderId: sourceOfficeId || undefined,
    }),
    [sourceOfficeId]
  );
  const { data: ledger = [] } = useConsumableLedger(ledgerFilters);

  const itemMap = useMemo(() => new Map((items || []).map((item) => [item.id, item])), [items]);
  const employeeMap = useMemo(
    () =>
      new Map(
        employees.map((employee) => [
          asId(employee),
          `${employee.first_name || ''} ${employee.last_name || ''}`.trim() || employee.email || asId(employee),
        ])
      ),
    [employees]
  );
  const sectionMap = useMemo(
    () => new Map(sections.map((section) => [asId(section), section.name])),
    [sections]
  );

  const assignmentHistory = useMemo(
    () =>
      ledger
        .filter(
          (entry) =>
            entry.tx_type === 'TRANSFER' &&
            entry.from_holder_type === 'OFFICE' &&
            (entry.to_holder_type === 'EMPLOYEE' || entry.to_holder_type === 'SUB_LOCATION')
        )
        .filter((entry) => {
          const item = itemMap.get(entry.consumable_item_id);
          if (!item) return false;
          const isChemical = item.is_chemical === true;
          return mode === 'chemicals' ? isChemical : !isChemical;
        }),
    [ledger, itemMap, mode]
  );

  const columns = [
    {
      key: 'tx_time',
      label: 'Date',
      render: (value: string) => new Date(value).toLocaleString(),
    },
    {
      key: 'consumable_item_id',
      label: 'Item',
      render: (value: string) => itemMap.get(value)?.name || 'Unknown',
    },
    {
      key: 'to_holder_type',
      label: 'Assigned To',
      render: (_: string, row: ConsumableInventoryTransaction) => {
        if (row.to_holder_type === 'EMPLOYEE') {
          return row.to_holder_id ? `${employeeMap.get(row.to_holder_id) || 'Unknown Employee'} (Employee)` : 'Employee';
        }
        if (row.to_holder_type === 'SUB_LOCATION') {
          return row.to_holder_id ? `${sectionMap.get(row.to_holder_id) || 'Unknown Section'} (Section)` : 'Section';
        }
        return 'N/A';
      },
    },
    {
      key: 'entered_qty',
      label: 'Qty',
      render: (_: number, row: ConsumableInventoryTransaction) => `${row.entered_qty} ${row.entered_uom}`,
    },
    {
      key: 'reference',
      label: 'Reference',
      render: (value: string | null) => value || '-',
    },
  ];

  return (
    <MainLayout title="Consumable Assignments" description="Assign consumables to employees and sections">
      <PageHeader
        title="Consumable Assignments"
        description="Assign stock from office storage to employees or sections/rooms"
        extra={<ConsumableModeToggle mode={mode} onChange={setMode} />}
      />

      <Card className="mb-6">
        <CardContent className="pt-6">
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Source Office *</Label>
                {role === 'org_admin' ? (
                  <Select value={sourceOfficeId} onValueChange={(value) => form.setValue('sourceOfficeId', value)}>
                    <SelectTrigger><SelectValue placeholder="Select office" /></SelectTrigger>
                    <SelectContent>
                      {filteredLocations.map((office) => (
                        <SelectItem key={office.id} value={office.id}>{office.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                    {filteredLocations.find((office) => office.id === sourceOfficeId)?.name || 'Assigned Office'}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Assignee Type *</Label>
                <Select
                  value={assigneeType}
                  onValueChange={(value) => {
                    form.setValue('assigneeType', value as AssigneeType);
                    form.setValue('assigneeId', '');
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EMPLOYEE">Employee</SelectItem>
                    <SelectItem value="SUB_LOCATION">Section / Room</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Assignee *</Label>
                <Select value={assigneeId} onValueChange={(value) => form.setValue('assigneeId', value)}>
                  <SelectTrigger><SelectValue placeholder="Select assignee" /></SelectTrigger>
                  <SelectContent>
                    {assigneeOptions.map((option) => (
                      <SelectItem key={`${option.type}:${option.id}`} value={option.id}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.assigneeId && (
                  <p className="text-sm text-destructive">{form.formState.errors.assigneeId.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Item *</Label>
                <Select value={itemId} onValueChange={(value) => form.setValue('itemId', value)}>
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
                <Select value={lotId || FEFO_VALUE} onValueChange={(value) => form.setValue('lotId', value)}>
                  <SelectTrigger><SelectValue placeholder="FEFO default" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={FEFO_VALUE}>FEFO default</SelectItem>
                    {(lots || [])
                      .filter((lot) => !itemId || lot.consumable_id === itemId)
                      .map((lot) => (
                        <SelectItem key={lot.id} value={lot.id}>{lot.batch_no}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="qty">Quantity *</Label>
                <Input id="qty" type="number" min={0} step="0.01" {...form.register('qty')} />
                {form.formState.errors.qty && (
                  <p className="text-sm text-destructive">{form.formState.errors.qty.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>UoM *</Label>
                <Select value={uom} onValueChange={(value) => form.setValue('uom', value)}>
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

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Available</Label>
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  {availableQty} {selectedItem?.base_uom || ''}
                </div>
              </div>

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
              <Button type="submit" disabled={transferMutation.isPending}>
                {transferMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Assign
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h3 className="mb-4 text-lg font-semibold">Recent Assignments</h3>
          <DataTable
            columns={columns}
            data={assignmentHistory as any}
            searchPlaceholder="Search assignments..."
          />
        </CardContent>
      </Card>
    </MainLayout>
  );
}
