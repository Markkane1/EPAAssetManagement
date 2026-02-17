import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
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
import { useReceiveConsumables } from '@/hooks/useConsumableInventory';
import { useConsumableUnits } from '@/hooks/useConsumableUnits';
import { useCategories } from '@/hooks/useCategories';
import { useProjects } from '@/hooks/useProjects';
import { useSchemes } from '@/hooks/useSchemes';
import { useVendors } from '@/hooks/useVendors';
import { getCompatibleUnits } from '@/lib/unitUtils';
import type { Category, ConsumableItem, Project, Scheme, Vendor } from '@/types';
import { useConsumableMode } from '@/hooks/useConsumableMode';
import { filterItemsByMode } from '@/lib/consumableMode';
import { ConsumableModeToggle } from '@/components/consumables/ConsumableModeToggle';

const receiveSchema = z.object({
  categoryId: z.string().min(1, 'Category is required'),
  itemId: z.string().min(1, 'Item is required'),
  source: z.enum(['procurement', 'project']),
  vendorId: z.string().optional(),
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

function getEntityId(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const record = value as { id?: unknown; _id?: unknown; toString?: () => string };
    if (typeof record.id === 'string') return record.id;
    if (typeof record._id === 'string') return record._id;
    if (record._id && typeof record._id === 'object' && 'toString' in (record._id as object)) {
      const parsed = String(record._id);
      if (parsed && parsed !== '[object Object]') return parsed;
    }
    if (typeof record.toString === 'function') {
      const parsed = record.toString();
      if (parsed && parsed !== '[object Object]') return parsed;
    }
  }
  return '';
}

function isPdfAttachment(file: File) {
  if (file.type === 'application/pdf') return true;
  return /\.pdf$/i.test(file.name);
}

export default function ConsumableReceive() {
  const [itemPickerOpen, setItemPickerOpen] = useState(false);
  const { data: items } = useConsumableItems();
  const { data: categories } = useCategories({ assetType: 'CONSUMABLE' });
  const { data: vendors } = useVendors();
  const { data: projects } = useProjects();
  const { data: schemes } = useSchemes();
  const { data: units } = useConsumableUnits();
  const { mode, setMode } = useConsumableMode();
  const receiveMutation = useReceiveConsumables();

  const [containers, setContainers] = useState<ContainerInput[]>([]);
  const [handoverDocumentationFile, setHandoverDocumentationFile] = useState<File | null>(null);
  const [handoverDocumentationError, setHandoverDocumentationError] = useState<string | null>(null);

  const form = useForm<ReceiveFormData>({
    resolver: zodResolver(receiveSchema),
    defaultValues: {
      categoryId: '',
      itemId: '',
      source: 'procurement',
      vendorId: '',
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

  const filteredCategories = useMemo(() => categories || [], [categories]);
  const modeFilteredItems = useMemo(() => filterItemsByMode(items || [], mode), [items, mode]);
  const selectedCategoryId = form.watch('categoryId');
  const selectedSource = form.watch('source');
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
    () => (schemes || []).filter((scheme) => getEntityId(scheme.project_id) === selectedProjectId),
    [schemes, selectedProjectId]
  );

  const selectedItem: ConsumableItem | undefined = useMemo(() => {
    return filteredItems.find((item) => item.id === selectedItemId);
  }, [filteredItems, selectedItemId]);

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
    if (currentCategory && !filteredCategories.some((category) => getEntityId(category) === currentCategory)) {
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

  const handleHandoverDocumentationChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] || null;
    if (!selected) {
      setHandoverDocumentationFile(null);
      setHandoverDocumentationError(null);
      return;
    }

    if (!isPdfAttachment(selected)) {
      setHandoverDocumentationFile(null);
      setHandoverDocumentationError('Attachment must be a PDF file.');
      event.target.value = '';
      return;
    }

    setHandoverDocumentationFile(selected);
    setHandoverDocumentationError(null);
  };

  const handleSubmit = async (data: ReceiveFormData) => {
    const requiresContainer = Boolean(selectedItem?.requires_container_tracking || selectedItem?.is_controlled);
    if (requiresContainer && containers.length === 0) {
      form.setError('itemId', { message: 'This item requires container entries' });
      return;
    }

    const payload: any = {
      holderType: 'STORE',
      holderId: 'HEAD_OFFICE_STORE',
      categoryId: data.categoryId,
      itemId: data.itemId,
        lot: {
          lotNumber: data.lotNumber,
          receivedDate: data.receivedDate,
          expiryDate: data.expiryDate,
        source: data.source,
        vendorId: data.source === 'procurement' ? data.vendorId || undefined : undefined,
        projectId: data.source === 'project' ? data.projectId || undefined : undefined,
        schemeId: data.source === 'project' ? data.schemeId || undefined : undefined,
      },
      handoverDocumentationFile,
      qty: data.qty,
      uom: data.uom,
      reference: data.reference || undefined,
      notes: data.notes || undefined,
    };

    if (containers.length > 0) {
      payload.containers = containers.map((container) => ({
        containerCode: container.containerCode,
        initialQty: Number(container.initialQty || 0),
      }));
    }

    await receiveMutation.mutateAsync(payload);
    form.reset({
      categoryId: '',
      itemId: '',
      source: 'procurement',
      vendorId: '',
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
    setHandoverDocumentationFile(null);
    setHandoverDocumentationError(null);
  };

  return (
    <MainLayout title="Lot Receiving" description="Receive consumables into Central Store">
      <PageHeader
        title="Lot Receiving"
        description="Receive lots into the Central Store"
        extra={<ConsumableModeToggle mode={mode} onChange={setMode} />}
      />

      <Card>
        <CardContent className="pt-6 space-y-6">
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Receiving Holder</Label>
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">Central Storage</div>
              </div>
              <div className="space-y-2">
                <Label>Category *</Label>
                <Select value={selectedCategoryId} onValueChange={(v) => form.setValue('categoryId', v)}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {filteredCategories.map((category: Category) => {
                      const id = getEntityId(category);
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

            <div className="grid grid-cols-2 gap-4">
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
                <Label>Source *</Label>
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
                    }
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="procurement">Procurement</SelectItem>
                    <SelectItem value="project">Project Handover</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {selectedSource === 'procurement' ? (
                <>
                  <div className="space-y-2">
                    <Label>Vendor *</Label>
                    <Select value={form.watch('vendorId') || ''} onValueChange={(v) => form.setValue('vendorId', v)}>
                      <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                      <SelectContent>
                        {(vendors || []).map((vendor: Vendor) => {
                          const id = getEntityId(vendor);
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
                          const id = getEntityId(project);
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
                          const id = getEntityId(scheme);
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

            {(selectedItem?.requires_container_tracking || selectedItem?.is_controlled) && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Container Details</h4>
                    <p className="text-sm text-muted-foreground">Controlled items require container tracking.</p>
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
        </CardContent>
      </Card>
    </MainLayout>
  );
}
