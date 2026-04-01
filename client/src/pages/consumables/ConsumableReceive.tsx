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
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useConsumableItems } from '@/hooks/useConsumableItems';
import { useReceiveConsumables, useReceiveConsumablesOffice } from '@/hooks/useConsumableInventory';
import { useConsumableUnits } from '@/hooks/useConsumableUnits';
import { useCategories } from '@/hooks/useCategories';
import { useProjects } from '@/hooks/useProjects';
import { useSchemes } from '@/hooks/useSchemes';
import { useCreatePurchaseOrder, usePurchaseOrders } from '@/hooks/usePurchaseOrders';
import { useVendors } from '@/hooks/useVendors';
import { useOffices } from '@/hooks/useOffices';
import { getCompatibleUnits } from '@/lib/unitUtils';
import type { Category, ConsumableItem, Project, PurchaseOrder, Scheme, Vendor } from '@/types';
import { useConsumableMode } from '@/hooks/useConsumableMode';
import { filterConsumableCategoriesByMode, filterItemsByMode } from '@/lib/consumableMode';
import { ConsumableModeToggle } from '@/components/consumables/ConsumableModeToggle';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessPage } from '@/config/pagePermissions';
import { getFormEntityId } from '@/components/forms/formEntityUtils';
import { usePdfAttachmentField } from '@/components/forms/usePdfAttachmentField';
import { PurchaseOrderFormModal } from '@/components/forms/PurchaseOrderFormModal';
import { MetricCard, WorkflowPanel } from '@/components/shared/workflow';

const receiveSchema = z.object({
  categoryId: z.string().min(1, 'Category is required'),
  itemId: z.string().min(1, 'Item is required'),
  source: z.enum(['procurement', 'project']),
  vendorId: z.string().optional(),
  purchaseOrderId: z.string().optional(),
  projectId: z.string().optional(),
  schemeId: z.string().optional(),
  lotNumber: z.string().min(1, 'Lot number is required'),
  receivedDate: z.string().min(1, 'Received date is required'),
  expiryDate: z.string().min(1, 'Expiry date is required'),
  qty: z.coerce.number().positive('Quantity must be greater than zero'),
  uom: z.string().min(1, 'Unit is required'),
  reference: z.string().optional(),
  notes: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.source === 'procurement' && !data.vendorId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['vendorId'],
      message: 'Vendor is required for procurement',
    });
  }

  if (data.source === 'project') {
    if (!data.projectId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['projectId'],
        message: 'Project is required for project handover',
      });
    }
    if (!data.schemeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['schemeId'],
        message: 'Scheme is required for project handover',
      });
    }
  }
});

type ReceiveFormData = z.infer<typeof receiveSchema>;

type ContainerInput = { containerCode: string; initialQty: string };

function buildAutoLotNumber(itemName?: string) {
  const token = (itemName || 'LOT')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4) || 'LOT';
  const stamp = new Date().toISOString().replace(/[^\d]/g, '').slice(0, 14);
  const random = Math.floor(Math.random() * 9000 + 1000);
  return `${token}-${stamp}-${random}`;
}

export default function ConsumableReceive() {
  const { role, isOrgAdmin, locationId } = useAuth();
  const officeScopedFlow =
    !isOrgAdmin && canAccessPage({ page: 'office-consumables', role, isOrgAdmin });
  const [itemPickerOpen, setItemPickerOpen] = useState(false);
  const [targetPickerOpen, setTargetPickerOpen] = useState(false);
  const [purchaseOrderModalOpen, setPurchaseOrderModalOpen] = useState(false);
  const [orgAdminReceiveTarget, setOrgAdminReceiveTarget] = useState('STORE:HEAD_OFFICE_STORE');
  const { data: items } = useConsumableItems();
  const { data: categories } = useCategories({ assetType: 'CONSUMABLE' });
  const { data: projects } = useProjects();
  const { data: schemes } = useSchemes();
  const { data: units } = useConsumableUnits();
  const { data: offices } = useOffices({ isActive: true });
  const { data: receiveTargetOffices } = useOffices({
    capability: mode === 'chemicals' ? 'chemicals' : 'consumables',
    isActive: true,
  });
  const { data: purchaseOrders } = usePurchaseOrders();
  const createPurchaseOrder = useCreatePurchaseOrder();
  const { mode, setMode } = useConsumableMode();
  const centralReceiveMutation = useReceiveConsumables();
  const officeReceiveMutation = useReceiveConsumablesOffice();
  const activeReceiveTarget = useMemo(() => {
    if (officeScopedFlow) {
      return {
        holderType: 'OFFICE' as const,
        holderId: String(locationId || '').trim(),
      };
    }
    const [holderTypeToken, holderIdToken] = orgAdminReceiveTarget.split(':');
    if (holderTypeToken === 'OFFICE' && holderIdToken) {
      return {
        holderType: 'OFFICE' as const,
        holderId: holderIdToken,
      };
    }
    return {
      holderType: 'STORE' as const,
      holderId: 'HEAD_OFFICE_STORE',
    };
  }, [locationId, officeScopedFlow, orgAdminReceiveTarget]);
  const officeReceivingFlow = activeReceiveTarget.holderType === 'OFFICE';
  const selectedReceivingOfficeId = officeReceivingFlow ? activeReceiveTarget.holderId : '';
  const { data: vendors } = useVendors(selectedReceivingOfficeId || undefined);

  const [containers, setContainers] = useState<ContainerInput[]>([]);
  const {
    attachmentFile: handoverDocumentationFile,
    attachmentError: handoverDocumentationError,
    handleAttachmentChange: handleHandoverDocumentationChange,
    resetAttachment: resetHandoverDocumentation,
  } = usePdfAttachmentField();
  const availableReceiveTargetOffices = useMemo(
    () => (receiveTargetOffices || []).filter((office) => office.is_active !== false),
    [receiveTargetOffices]
  );
  const receiveTargetOptions = useMemo(
    () => [
      { value: 'STORE:HEAD_OFFICE_STORE', label: 'Central Store' },
      ...availableReceiveTargetOffices.map((office) => ({
        value: `OFFICE:${office.id}`,
        label: office.name,
      })),
    ],
    [availableReceiveTargetOffices]
  );
  const selectedReceiveTargetLabel = useMemo(
    () =>
      receiveTargetOptions.find((option) => option.value === orgAdminReceiveTarget)?.label ||
      'Select receiving target',
    [orgAdminReceiveTarget, receiveTargetOptions]
  );
  const userLocationName = useMemo(
    () => (offices || []).find((office) => office.id === locationId)?.name || 'Your Office',
    [offices, locationId]
  );
  const selectedReceivingOfficeName = useMemo(
    () =>
      (offices || []).find((office) => office.id === selectedReceivingOfficeId)?.name ||
      userLocationName,
    [offices, selectedReceivingOfficeId, userLocationName]
  );
  const receivingTargetLabel = officeReceivingFlow ? selectedReceivingOfficeName : 'Central Store';
  const receiveMutation = officeReceivingFlow ? officeReceiveMutation : centralReceiveMutation;

  const form = useForm<ReceiveFormData>({
    resolver: zodResolver(receiveSchema),
    defaultValues: {
      categoryId: '',
      itemId: '',
      source: 'procurement',
      vendorId: '',
      purchaseOrderId: '',
      projectId: '',
      schemeId: '',
      lotNumber: '',
      receivedDate: new Date().toISOString().split('T')[0],
      expiryDate: '',
      qty: 0,
      uom: '',
      reference: '',
      notes: '',
    },
  });

  const filteredCategories = useMemo(
    () => filterConsumableCategoriesByMode(categories || [], mode),
    [categories, mode]
  );
  const modeFilteredItems = useMemo(() => filterItemsByMode(items || [], mode), [items, mode]);
  const selectedCategoryId = form.watch('categoryId');
  const selectedSource = officeReceivingFlow ? 'procurement' : form.watch('source');
  const selectedVendorId = form.watch('vendorId');
  const selectedProjectId = form.watch('projectId');
  const filteredItems = useMemo(
    () => modeFilteredItems.filter((item) => item.category_id === selectedCategoryId),
    [modeFilteredItems, selectedCategoryId]
  );
  const unitList = useMemo(() => units || [], [units]);
  const allUnitCodes = useMemo(
    () => Array.from(new Set(unitList.map((unit) => String(unit.code || '').trim()).filter(Boolean))),
    [unitList]
  );
  const selectedItemId = form.watch('itemId');
  const selectedUom = form.watch('uom');
  const attachmentLabel = selectedSource === 'project' ? 'Project Handover Documentation' : 'Invoice';
  const filteredSchemes = useMemo(
    () => (schemes || []).filter((scheme) => getFormEntityId(scheme.project_id) === selectedProjectId),
    [schemes, selectedProjectId]
  );
  const purchaseOrderList = useMemo(
    () => (purchaseOrders || []).filter((order) => order.source_type === 'procurement'),
    [purchaseOrders]
  );
  const accessibleVendorIds = useMemo(
    () => new Set((vendors || []).map((vendor) => getFormEntityId(vendor)).filter(Boolean) as string[]),
    [vendors]
  );
  const visiblePurchaseOrders = useMemo(
    () =>
      purchaseOrderList.filter((order) => {
        if (order.vendor_id && !accessibleVendorIds.has(order.vendor_id)) {
          return false;
        }
        if (selectedVendorId && order.vendor_id !== selectedVendorId) {
          return false;
        }
        return true;
      }),
    [accessibleVendorIds, purchaseOrderList, selectedVendorId]
  );
  const purchaseOrderById = useMemo(
    () => new Map(purchaseOrderList.map((order) => [order.id, order])),
    [purchaseOrderList]
  );
  const purchaseOrderPrefill = useMemo(
    () => ({
      sourceType: 'procurement' as const,
      vendorId: selectedVendorId || undefined,
    }),
    [selectedVendorId]
  );

  const selectedItem: ConsumableItem | undefined = useMemo(() => {
    return filteredItems.find((item) => item.id === selectedItemId);
  }, [filteredItems, selectedItemId]);
  const categoryCount = filteredCategories.length;
  const itemCount = filteredItems.length;

  useEffect(() => {
    if (officeReceivingFlow) {
      form.setValue('source', 'procurement');
      form.setValue('projectId', '');
      form.setValue('schemeId', '');
    }
  }, [officeReceivingFlow, form]);

  useEffect(() => {
    if (officeScopedFlow || !isOrgAdmin) return;
    if (!orgAdminReceiveTarget.startsWith('OFFICE:')) return;
    const officeId = orgAdminReceiveTarget.slice('OFFICE:'.length);
    if (!officeId) {
      setOrgAdminReceiveTarget('STORE:HEAD_OFFICE_STORE');
      return;
    }
    if (!availableReceiveTargetOffices.some((office) => office.id === officeId)) {
      setOrgAdminReceiveTarget('STORE:HEAD_OFFICE_STORE');
    }
  }, [availableReceiveTargetOffices, isOrgAdmin, officeScopedFlow, orgAdminReceiveTarget]);

  useEffect(() => {
    const currentVendorId = form.getValues('vendorId');
    if (!currentVendorId) return;
    const exists = (vendors || []).some((vendor) => getFormEntityId(vendor) === currentVendorId);
    if (!exists) {
      form.setValue('vendorId', '');
      form.setValue('purchaseOrderId', '');
    }
  }, [form, vendors]);

  useEffect(() => {
    if (selectedSource === 'procurement') return;
    if (form.getValues('purchaseOrderId')) {
      form.setValue('purchaseOrderId', '');
    }
  }, [form, selectedSource]);

  useEffect(() => {
    const currentItem = form.getValues('itemId');
    if (currentItem && !filteredItems.some((item) => item.id === currentItem)) {
      form.setValue('itemId', '');
      form.setValue('uom', '');
      setContainers([]);
    }
  }, [filteredItems, form]);

  useEffect(() => {
    const currentCategory = form.getValues('categoryId');
    if (currentCategory && !filteredCategories.some((category) => getFormEntityId(category) === currentCategory)) {
      form.setValue('categoryId', '');
      form.setValue('itemId', '');
      form.setValue('uom', '');
      setContainers([]);
    }
  }, [filteredCategories, form]);

  const compatibleUnits = useMemo(() => {
    if (!selectedItem) return allUnitCodes;
    const resolved = getCompatibleUnits(selectedItem.base_uom, unitList);
    const next = resolved.length ? resolved : allUnitCodes;
    if (!next.includes(selectedItem.base_uom)) {
      return [selectedItem.base_uom, ...next];
    }
    return next;
  }, [selectedItem, unitList, allUnitCodes]);

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
    const currentLotNumber = form.getValues('lotNumber');
    if (currentLotNumber) return;
    form.setValue('lotNumber', buildAutoLotNumber(selectedItem?.name));
  }, [selectedItem?.name, form]);

  const addContainer = () => {
    setContainers((prev) => [...prev, { containerCode: '', initialQty: '' }]);
  };

  const removeContainer = (index: number) => {
    setContainers((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateContainer = (index: number, key: keyof ContainerInput, value: string) => {
    setContainers((prev) => prev.map((item, idx) => (idx === index ? { ...item, [key]: value } : item)));
  };

  const handlePurchaseOrderChange = (nextValue: string) => {
    const purchaseOrderId = nextValue === '__none__' ? '' : nextValue;
    form.setValue('purchaseOrderId', purchaseOrderId, { shouldDirty: true, shouldValidate: true });
    const selectedOrder = purchaseOrderId ? purchaseOrderById.get(purchaseOrderId) : null;
    if (selectedOrder?.vendor_id) {
      form.setValue('vendorId', selectedOrder.vendor_id, { shouldDirty: true, shouldValidate: true });
    }
  };

  const handlePurchaseOrderSubmit = async (data: any) => {
    const createdOrder = await createPurchaseOrder.mutateAsync(data);
    setPurchaseOrderModalOpen(false);
    form.setValue('purchaseOrderId', createdOrder.id, { shouldDirty: true, shouldValidate: true });
    if (createdOrder.vendor_id) {
      form.setValue('vendorId', createdOrder.vendor_id, { shouldDirty: true, shouldValidate: true });
    }
  };

  const handleSubmit = async (data: ReceiveFormData) => {
    const effectiveSource = officeReceivingFlow ? 'procurement' : data.source;
    const requiresContainer = Boolean(
      selectedItem?.is_chemical || selectedItem?.requires_container_tracking || selectedItem?.is_controlled
    );
    if (requiresContainer && containers.length === 0) {
      form.setError('itemId', { message: 'This item requires container entries' });
      return;
    }
    if (containers.length > 0) {
      const normalizedContainers = containers.map((container) => ({
        containerCode: container.containerCode.trim(),
        initialQty: Number(container.initialQty || 0),
      }));
      if (normalizedContainers.some((container) => !container.containerCode)) {
        form.setError('itemId', { message: 'Each container must have a code' });
        return;
      }
      if (normalizedContainers.some((container) => !Number.isFinite(container.initialQty) || container.initialQty <= 0)) {
        form.setError('qty', { message: 'Each container quantity must be greater than zero' });
        return;
      }
      const containerQtyTotal = normalizedContainers.reduce((sum, container) => sum + container.initialQty, 0);
      if (Math.abs(containerQtyTotal - Number(data.qty || 0)) > 0.0001) {
        form.setError('qty', { message: 'Container quantities must equal the received quantity' });
        return;
      }
    }

    const payload: any = {
      holderType: activeReceiveTarget.holderType,
      holderId: activeReceiveTarget.holderId,
      categoryId: data.categoryId,
      itemId: data.itemId,
        lot: {
          lotNumber: data.lotNumber,
          receivedDate: data.receivedDate,
          expiryDate: data.expiryDate,
        source: effectiveSource,
        vendorId: effectiveSource === 'procurement' ? data.vendorId || undefined : undefined,
        purchaseOrderId: effectiveSource === 'procurement' ? data.purchaseOrderId || undefined : undefined,
        projectId: effectiveSource === 'project' ? data.projectId || undefined : undefined,
        schemeId: effectiveSource === 'project' ? data.schemeId || undefined : undefined,
      },
      handoverDocumentationFile,
      qty: data.qty,
      uom: data.uom,
      reference: data.reference || undefined,
      notes: data.notes || undefined,
    };

    if (containers.length > 0) {
      payload.containers = containers.map((container) => ({
        containerCode: container.containerCode.trim(),
        initialQty: Number(container.initialQty || 0),
      }));
    }

    await receiveMutation.mutateAsync(payload);
    form.reset({
      categoryId: '',
      itemId: '',
      source: 'procurement',
      vendorId: '',
      purchaseOrderId: '',
      projectId: '',
      schemeId: '',
      lotNumber: buildAutoLotNumber(),
      receivedDate: new Date().toISOString().split('T')[0],
      expiryDate: '',
      qty: 0,
      uom: '',
      reference: '',
      notes: '',
    });
    setContainers([]);
    resetHandoverDocumentation();
  };

  return (
    <MainLayout
      title="Stock Intake"
      description={
        officeReceivingFlow
          ? `Receive consumables into ${receivingTargetLabel}`
          : 'Receive consumables into Central Store'
      }
    >
      <PageHeader
        title="Stock Intake"
        description={
          officeReceivingFlow
            ? `Receive procurement lots directly into ${receivingTargetLabel}`
            : 'Receive consumable and lab lots into the Central Store'
        }
        eyebrow="Consumables workspace"
        meta={
          <>
            <span>{categoryCount} eligible categories</span>
            <span className="hidden h-1 w-1 rounded-full bg-border sm:inline-block" />
            <span>{itemCount} item options for the selected category mode</span>
          </>
        }
        extra={<ConsumableModeToggle mode={mode} onChange={setMode} />}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Categories" value={categoryCount} helper="Consumable categories available in this mode" icon={Loader2} tone="primary" />
        <MetricCard label="Items" value={itemCount} helper="Intake-ready item definitions after category filtering" icon={Loader2} tone="success" />
        <MetricCard label="Purchase orders" value={visiblePurchaseOrders.length} helper="Procurement orders available for binding" icon={Loader2} />
        <MetricCard label="Containers" value={containers.length} helper="Tracked containers being added with this lot" icon={Loader2} tone="warning" />
      </div>

      <WorkflowPanel title="Stock intake workflow" description="Receive procurement or project-supplied consumables through the same dashboard-aligned operational shell as the rest of the inventory system.">
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>
                  {isOrgAdmin && !officeScopedFlow
                    ? 'Receiving Target'
                    : officeReceivingFlow
                      ? 'Receiving Office'
                      : 'Receiving Holder'}
                </Label>
                {isOrgAdmin && !officeScopedFlow ? (
                  <Popover open={targetPickerOpen} onOpenChange={setTargetPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="w-full justify-between">
                        {selectedReceiveTargetLabel}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search receiving target..." />
                        <CommandList>
                          <CommandEmpty>No target found.</CommandEmpty>
                          {receiveTargetOptions.map((option) => (
                            <CommandItem
                              key={option.value}
                              value={`${option.label} ${option.value}`}
                              onSelect={() => {
                                setOrgAdminReceiveTarget(option.value);
                                setTargetPickerOpen(false);
                              }}
                            >
                              {option.label}
                            </CommandItem>
                          ))}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                    {officeReceivingFlow ? userLocationName : 'Central Store'}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Category *</Label>
                <Select value={selectedCategoryId} onValueChange={(v) => form.setValue('categoryId', v)}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {filteredCategories.map((category: Category) => {
                      const id = getFormEntityId(category);
                      if (!id) return null;
                      return <SelectItem key={id} value={id}>{category.name}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
                {form.formState.errors.categoryId && (
                  <p className="text-sm text-destructive">{form.formState.errors.categoryId.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Item *</Label>
                <Popover open={itemPickerOpen} onOpenChange={setItemPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between">
                      {selectedItem ? selectedItem.name : 'Search item by name...'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0" align="start">
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
                <Label>Source *</Label>
                {officeReceivingFlow ? (
                  <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground cursor-not-allowed">
                    Procurement Only
                  </div>
                ) : (
                  <Select
                    value={selectedSource}
                    onValueChange={(v) => {
                      const source = v as 'procurement' | 'project';
                      form.setValue('source', source);
                      if (source === 'procurement') {
                        form.setValue('projectId', '');
                        form.setValue('schemeId', '');
                      } else {
                        form.setValue('vendorId', '');
                        form.setValue('purchaseOrderId', '');
                      }
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="procurement">Procurement</SelectItem>
                      <SelectItem value="project">Project Handover</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {selectedSource === 'procurement' ? (
                <>
                  <div className="space-y-2">
                    <Label>Vendor *</Label>
                    <Select
                      value={form.watch('vendorId') || ''}
                      onValueChange={(v) => {
                        form.setValue('vendorId', v, { shouldDirty: true, shouldValidate: true });
                        const selectedOrder = purchaseOrderById.get(form.getValues('purchaseOrderId') || '');
                        if (selectedOrder && selectedOrder.vendor_id !== v) {
                          form.setValue('purchaseOrderId', '', { shouldDirty: true, shouldValidate: true });
                        }
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                      <SelectContent>
                        {(vendors || []).map((vendor: Vendor) => {
                          const id = getFormEntityId(vendor);
                          if (!id) return null;
                          return <SelectItem key={id} value={id}>{vendor.name}</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                    {form.formState.errors.vendorId && (
                      <p className="text-sm text-destructive">{form.formState.errors.vendorId.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label>Purchase Order</Label>
                      <Button type="button" variant="outline" size="sm" onClick={() => setPurchaseOrderModalOpen(true)}>
                        New Purchase Order
                      </Button>
                    </div>
                    <Select
                      value={form.watch('purchaseOrderId') || '__none__'}
                      onValueChange={handlePurchaseOrderChange}
                    >
                      <SelectTrigger><SelectValue placeholder="Link a procurement purchase order" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No purchase order</SelectItem>
                        {visiblePurchaseOrders.map((order: PurchaseOrder) => (
                          <SelectItem key={order.id} value={order.id}>
                            {order.order_number}
                            {order.source_name ? ` - ${order.source_name}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Link the received lot to its procurement order to keep intake and purchasing in sync.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="handoverDocumentation">{attachmentLabel}</Label>
                    <Input
                      id="handoverDocumentation"
                      type="file"
                      accept="application/pdf,.pdf"
                      className="h-10 file:mr-3 file:h-10 file:border-0 file:bg-transparent file:text-sm file:font-medium"
                      onChange={handleHandoverDocumentationChange}
                    />
                    {handoverDocumentationFile ? (
                      <p className="text-xs text-muted-foreground">Selected file: {handoverDocumentationFile.name}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Upload a PDF file (optional).</p>
                    )}
                    {handoverDocumentationError && <p className="text-sm text-destructive">{handoverDocumentationError}</p>}
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Project *</Label>
                    <Select
                      value={selectedProjectId || ''}
                      onValueChange={(v) => {
                        form.setValue('projectId', v);
                        form.setValue('schemeId', '');
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                      <SelectContent>
                        {(projects || []).map((project: Project) => {
                          const id = getFormEntityId(project);
                          if (!id) return null;
                          return <SelectItem key={id} value={id}>{project.name}</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                    {form.formState.errors.projectId && (
                      <p className="text-sm text-destructive">{form.formState.errors.projectId.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Scheme *</Label>
                    <Select
                      value={form.watch('schemeId') || ''}
                      onValueChange={(v) => form.setValue('schemeId', v)}
                      disabled={!selectedProjectId}
                    >
                      <SelectTrigger><SelectValue placeholder={selectedProjectId ? 'Select scheme' : 'Select project first'} /></SelectTrigger>
                      <SelectContent>
                        {filteredSchemes.map((scheme: Scheme) => {
                          const id = getFormEntityId(scheme);
                          if (!id) return null;
                          return <SelectItem key={id} value={id}>{scheme.name}</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                    {form.formState.errors.schemeId && (
                      <p className="text-sm text-destructive">{form.formState.errors.schemeId.message}</p>
                    )}
                  </div>
                </>
              )}
            </div>
            {selectedSource === 'project' && (
              <div className="space-y-2">
                <Label htmlFor="handoverDocumentation">{attachmentLabel}</Label>
                <Input
                  id="handoverDocumentation"
                  type="file"
                  accept="application/pdf,.pdf"
                  className="h-10 file:mr-3 file:h-10 file:border-0 file:bg-transparent file:text-sm file:font-medium"
                  onChange={handleHandoverDocumentationChange}
                />
                {handoverDocumentationFile ? (
                  <p className="text-xs text-muted-foreground">Selected file: {handoverDocumentationFile.name}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Upload a PDF file (optional).</p>
                )}
                {handoverDocumentationError && <p className="text-sm text-destructive">{handoverDocumentationError}</p>}
              </div>
            )}

            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="lotNumber">Lot Number *</Label>
                <Input id="lotNumber" {...form.register('lotNumber')} placeholder="Auto-generated (editable)" />
                {form.formState.errors.lotNumber && (
                  <p className="text-sm text-destructive">{form.formState.errors.lotNumber.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="receivedDate">Received Date *</Label>
                <Input id="receivedDate" type="date" {...form.register('receivedDate')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expiryDate">Expiry Date *</Label>
                <Input id="expiryDate" type="date" {...form.register('expiryDate')} />
                {form.formState.errors.expiryDate && (
                  <p className="text-sm text-destructive">{form.formState.errors.expiryDate.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="reference">Reference</Label>
                <Input id="reference" {...form.register('reference')} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="qty">Quantity *</Label>
                <Input id="qty" type="number" min={0} step="0.01" {...form.register('qty')} />
                {form.formState.errors.qty && (
                  <p className="text-sm text-destructive">{form.formState.errors.qty.message}</p>
                )}
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
                <Label htmlFor="notes">Notes</Label>
                <Input id="notes" {...form.register('notes')} />
              </div>
            </div>

            {(selectedItem?.is_chemical || selectedItem?.requires_container_tracking || selectedItem?.is_controlled) && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Container Details</h4>
                    <p className="text-sm text-muted-foreground">
                      Chemical and controlled items require container tracking.
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addContainer}>
                    <Plus className="h-4 w-4 mr-2" /> Add Container
                  </Button>
                </div>
                {containers.length === 0 && (
                  <p className="text-sm text-destructive">At least one container is required.</p>
                )}
                {containers.map((container, index) => (
                  <div key={index} className="grid grid-cols-3 gap-4 items-end">
                    <div className="space-y-2">
                      <Label>Container Code</Label>
                      <Input value={container.containerCode} onChange={(e) => updateContainer(index, 'containerCode', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Initial Qty</Label>
                      <Input type="number" min={0} step="0.01" value={container.initialQty} onChange={(e) => updateContainer(index, 'initialQty', e.target.value)} />
                    </div>
                    <Button type="button" variant="ghost" onClick={() => removeContainer(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={receiveMutation.isPending}>
                {receiveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Receive Lot
              </Button>
            </div>
          </form>
      </WorkflowPanel>
      <PurchaseOrderFormModal
        open={purchaseOrderModalOpen}
        onOpenChange={setPurchaseOrderModalOpen}
        vendors={vendors || []}
        projects={projects || []}
        schemes={schemes || []}
        sourceTypeLocked="procurement"
        prefill={purchaseOrderPrefill}
        onSubmit={handlePurchaseOrderSubmit}
      />
    </MainLayout>
  );
}


