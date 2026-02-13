import { useEffect, useState } from 'react';
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
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import type { ConsumableUnit } from '@/types';

const unitSchema = z.object({
  code: z.string().min(1, 'Code is required').max(32),
  name: z.string().min(1, 'Name is required').max(120),
  group: z.enum(['mass', 'volume', 'count']),
  toBase: z.coerce.number().positive('Conversion factor must be greater than zero'),
  aliases: z.string().optional(),
  isActive: z.boolean().optional(),
});

type ConsumableUnitFormData = z.infer<typeof unitSchema>;

interface ConsumableUnitFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unit?: ConsumableUnit | null;
  onSubmit: (data: {
    code: string;
    name: string;
    group: 'mass' | 'volume' | 'count';
    toBase: number;
    aliases?: string[];
    isActive?: boolean;
  }) => Promise<void>;
}

export function ConsumableUnitFormModal({
  open,
  onOpenChange,
  unit,
  onSubmit,
}: ConsumableUnitFormModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = !!unit;

  const form = useForm<ConsumableUnitFormData>({
    resolver: zodResolver(unitSchema),
    defaultValues: {
      code: unit?.code || '',
      name: unit?.name || '',
      group: unit?.group || 'mass',
      toBase: unit?.to_base ?? 1,
      aliases: unit?.aliases?.join(', ') || '',
      isActive: unit?.is_active ?? true,
    },
  });

  useEffect(() => {
    if (unit) {
      form.reset({
        code: unit.code,
        name: unit.name,
        group: unit.group,
        toBase: unit.to_base,
        aliases: unit.aliases?.join(', ') || '',
        isActive: unit.is_active ?? true,
      });
    } else {
      form.reset({
        code: '',
        name: '',
        group: 'mass',
        toBase: 1,
        aliases: '',
        isActive: true,
      });
    }
  }, [unit, form]);

  const handleSubmit = async (data: ConsumableUnitFormData) => {
    setIsSubmitting(true);
    try {
      const aliases = data.aliases
        ? data.aliases
            .split(',')
            .map((alias) => alias.trim())
            .filter((alias) => alias.length > 0)
        : undefined;
      await onSubmit({
        code: data.code.trim(),
        name: data.name.trim(),
        group: data.group,
        toBase: data.toBase,
        aliases,
        isActive: data.isActive,
      });
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Unit' : 'Add Unit'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update the unit definition.' : 'Create a new unit for consumables.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="code">Code *</Label>
              <Input id="code" {...form.register('code')} placeholder="e.g., g, mL" />
              {form.formState.errors.code && (
                <p className="text-sm text-destructive">{form.formState.errors.code.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input id="name" {...form.register('name')} placeholder="e.g., Gram" />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Group *</Label>
              <Select value={form.watch('group')} onValueChange={(v) => form.setValue('group', v as 'mass' | 'volume' | 'count')}>
                <SelectTrigger><SelectValue placeholder="Select group" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mass">Mass</SelectItem>
                  <SelectItem value="volume">Volume</SelectItem>
                  <SelectItem value="count">Count</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="toBase">To Base Factor *</Label>
              <Input id="toBase" type="number" step="0.0001" min={0} {...form.register('toBase')} />
              {form.formState.errors.toBase && (
                <p className="text-sm text-destructive">{form.formState.errors.toBase.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="aliases">Aliases</Label>
            <Input id="aliases" {...form.register('aliases')} placeholder="ml, millilitre" />
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={form.watch('isActive')} onCheckedChange={(checked) => form.setValue('isActive', checked)} />
            <Label>Active</Label>
          </div>

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
