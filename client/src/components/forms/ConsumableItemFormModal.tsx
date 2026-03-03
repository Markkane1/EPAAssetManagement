import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import type { Category, ConsumableItem, ConsumableUnit } from '@/types';
import { type ConsumableMode } from '@/lib/consumableMode';

const itemSchema = z.object({
  name: z.string().min(1, 'Name is required').max(120),
  casNumber: z.string().max(64).optional(),
  categoryId: z.string().optional(),
  baseUom: z.string().min(1, 'Base UoM is required'),
  isHazardous: z.boolean().optional(),
  isControlled: z.boolean().optional(),
  isChemical: z.boolean().optional(),
  requiresLotTracking: z.boolean().optional(),
  requiresContainerTracking: z.boolean().optional(),
  defaultMinStock: z.coerce.number().min(0).optional(),
  defaultReorderPoint: z.coerce.number().min(0).optional(),
  storageCondition: z.string().max(200).optional(),
});

type ConsumableItemFormData = z.infer<typeof itemSchema>;

interface ConsumableItemFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: ConsumableItem | null;
  mode: ConsumableMode;
  categories: Category[];
  units: ConsumableUnit[];
  onSubmit: (data: ConsumableItemFormData) => Promise<void>;
}

export function ConsumableItemFormModal({
  open,
  onOpenChange,
  item,
  mode,
  categories,
  units,
  onSubmit,
}: ConsumableItemFormModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = !!item;
  const isChemicalMode = mode === 'chemicals';
  const unitOptions = units.length > 0 ? units : [];
  const fallbackUom = unitOptions[0]?.code || 'g';

  const form = useForm<ConsumableItemFormData>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      name: item?.name || '',
      casNumber: isChemicalMode ? item?.cas_number || '' : '',
      categoryId: item?.category_id || '',
      baseUom: item?.base_uom || fallbackUom,
      isHazardous: isChemicalMode ? item?.is_hazardous || false : false,
      isControlled: isChemicalMode ? item?.is_controlled || false : false,
      isChemical: isChemicalMode,
      requiresLotTracking: isChemicalMode ? item?.requires_lot_tracking ?? true : true,
      requiresContainerTracking: isChemicalMode ? item?.requires_container_tracking || false : false,
      defaultMinStock: item?.default_min_stock ?? undefined,
      defaultReorderPoint: item?.default_reorder_point ?? undefined,
      storageCondition: isChemicalMode ? item?.storage_condition || '' : '',
    },
  });

  useEffect(() => {
    if (item) {
      form.reset({
        name: item.name,
        casNumber: isChemicalMode ? item.cas_number || '' : '',
        categoryId: item.category_id || '',
        baseUom: item.base_uom,
        isHazardous: isChemicalMode ? item.is_hazardous : false,
        isControlled: isChemicalMode ? item.is_controlled : false,
        isChemical: isChemicalMode,
        requiresLotTracking: isChemicalMode ? item.requires_lot_tracking : true,
        requiresContainerTracking: isChemicalMode ? item.requires_container_tracking : false,
        defaultMinStock: item.default_min_stock ?? undefined,
        defaultReorderPoint: item.default_reorder_point ?? undefined,
        storageCondition: isChemicalMode ? item.storage_condition || '' : '',
      });
    } else {
      form.reset({
        name: '',
        casNumber: '',
        categoryId: '',
        baseUom: fallbackUom,
        isHazardous: false,
        isControlled: false,
        isChemical: false,
        requiresLotTracking: true,
        requiresContainerTracking: false,
        defaultMinStock: undefined,
        defaultReorderPoint: undefined,
        storageCondition: '',
      });
    }
  }, [item, form, fallbackUom, isChemicalMode]);

  const filteredCategories = useMemo(() => {
    return categories.filter((category) => {
      const scope = String(category.scope || 'GENERAL').toUpperCase();
      if (isChemicalMode) return scope === 'LAB_ONLY';
      return scope !== 'LAB_ONLY';
    });
  }, [categories, isChemicalMode]);

  useEffect(() => {
    const selectedCategoryId = form.getValues('categoryId') || '';
    if (!selectedCategoryId) return;
    if (!filteredCategories.some((category) => category.id === selectedCategoryId)) {
      form.setValue('categoryId', '');
    }
  }, [filteredCategories, form]);

  const handleSubmit = async (data: ConsumableItemFormData) => {
    setIsSubmitting(true);
    try {
      const requiresLotTracking = isChemicalMode ? Boolean(data.requiresLotTracking) : true;
      await onSubmit({
        ...data,
        isChemical: isChemicalMode,
        isHazardous: isChemicalMode ? Boolean(data.isHazardous) : false,
        isControlled: isChemicalMode ? Boolean(data.isControlled) : false,
        requiresContainerTracking: isChemicalMode ? Boolean(data.requiresContainerTracking) : false,
        requiresLotTracking,
        categoryId: data.categoryId || undefined,
        casNumber: isChemicalMode ? data.casNumber || undefined : undefined,
        storageCondition: isChemicalMode ? data.storageCondition || undefined : undefined,
      });
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Consumable Item' : 'Add Consumable Item'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update the consumable master record.' : 'Create a new consumable master record.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input id="name" {...form.register('name')} placeholder="e.g., Sodium Chloride" />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            {isChemicalMode && (
              <div className="space-y-2">
                <Label htmlFor="casNumber">CAS Number</Label>
                <Input id="casNumber" {...form.register('casNumber')} placeholder="e.g., 7647-14-5" />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.watch('categoryId') || ''} onValueChange={(v) => form.setValue('categoryId', v)}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {filteredCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Base UoM *</Label>
              <Select value={form.watch('baseUom')} onValueChange={(v) => form.setValue('baseUom', v)}>
                <SelectTrigger><SelectValue placeholder="Select base unit" /></SelectTrigger>
                <SelectContent>
                  {unitOptions.length > 0 ? (
                    unitOptions.map((uom) => (
                      <SelectItem key={uom.code} value={uom.code}>{uom.code}</SelectItem>
                    ))
                  ) : (
                    <SelectItem value={fallbackUom}>{fallbackUom}</SelectItem>
                  )}
                </SelectContent>
              </Select>
              {form.formState.errors.baseUom && (
                <p className="text-sm text-destructive">{form.formState.errors.baseUom.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="defaultMinStock">Default Min Stock (base)</Label>
              <Input id="defaultMinStock" type="number" min={0} step="0.01" {...form.register('defaultMinStock')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="defaultReorderPoint">Default Reorder Point (base)</Label>
              <Input id="defaultReorderPoint" type="number" min={0} step="0.01" {...form.register('defaultReorderPoint')} />
            </div>
          </div>

          {isChemicalMode && (
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <Checkbox checked disabled />
                <Label>Chemical item</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={form.watch('isHazardous')}
                  onCheckedChange={(checked) => form.setValue('isHazardous', Boolean(checked))}
                />
                <Label>Hazardous</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={form.watch('isControlled')}
                  onCheckedChange={(checked) => form.setValue('isControlled', Boolean(checked))}
                />
                <Label>Controlled</Label>
              </div>
            </div>
          )}

          {isChemicalMode && (
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={form.watch('requiresLotTracking')}
                  onCheckedChange={(checked) => form.setValue('requiresLotTracking', Boolean(checked))}
                />
                <Label>Requires lot tracking</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={form.watch('requiresContainerTracking')}
                  onCheckedChange={(checked) => form.setValue('requiresContainerTracking', Boolean(checked))}
                />
                <Label>Requires container tracking</Label>
              </div>
            </div>
          )}

          {isChemicalMode && (
            <div className="space-y-2">
              <Label htmlFor="storageCondition">Storage Condition</Label>
              <Input id="storageCondition" {...form.register('storageCondition')} placeholder="e.g., 2-8 C, dry" />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
