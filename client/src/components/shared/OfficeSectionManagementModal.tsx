import { useMemo, useState } from 'react';
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
import { DataTable } from '@/components/shared/DataTable';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Loader2, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import type { Office } from '@/types';
import type { OfficeSubLocation } from '@/services/officeSubLocationService';
import {
  useCreateOfficeSubLocation,
  useDeleteOfficeSubLocation,
  useOfficeSubLocations,
  useUpdateOfficeSubLocation,
} from '@/hooks/useOfficeSubLocations';

const ALL_VALUE = '__all__';

const sectionSchema = z.object({
  officeId: z.string().min(1, 'Office is required'),
  name: z.string().min(1, 'Section/room name is required'),
});

type SectionFormData = z.infer<typeof sectionSchema>;

function SectionFormModal(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offices: Office[];
  section: OfficeSubLocation | null;
  onSubmit: (data: SectionFormData) => Promise<void>;
}) {
  const { open, onOpenChange, offices, section, onSubmit } = props;
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<SectionFormData>({
    resolver: zodResolver(sectionSchema),
    values: {
      officeId: section?.office_id || '',
      name: section?.name || '',
    },
  });

  const handleSubmit = async (data: SectionFormData) => {
    setIsSubmitting(true);
    try {
      await onSubmit(data);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{section ? 'Edit Section' : 'Add Section'}</DialogTitle>
          <DialogDescription>Sections (rooms) are scoped to an office.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Office *</Label>
            <Select
              value={form.watch('officeId')}
              onValueChange={(value) => form.setValue('officeId', value)}
              disabled={Boolean(section)}
            >
              <SelectTrigger><SelectValue placeholder="Select office" /></SelectTrigger>
              <SelectContent>
                {offices.map((office) => (
                  <SelectItem key={office.id} value={office.id}>{office.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.officeId && (
              <p className="text-sm text-destructive">{form.formState.errors.officeId.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="sectionName">Section / Room Name *</Label>
            <Input id="sectionName" {...form.register('name')} placeholder="e.g. Section A, Room 101" />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {section ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface OfficeSectionManagementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offices: Office[];
}

export function OfficeSectionManagementModal({ open, onOpenChange, offices }: OfficeSectionManagementModalProps) {
  const [selectedOfficeId, setSelectedOfficeId] = useState(ALL_VALUE);
  const [formOpen, setFormOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<OfficeSubLocation | null>(null);
  const queryParams = useMemo(
    () => ({ officeId: selectedOfficeId === ALL_VALUE ? undefined : selectedOfficeId, includeInactive: true }),
    [selectedOfficeId]
  );

  const { data: sections = [], isLoading } = useOfficeSubLocations(queryParams);
  const createSection = useCreateOfficeSubLocation();
  const updateSection = useUpdateOfficeSubLocation();
  const deleteSection = useDeleteOfficeSubLocation();

  const officeMap = useMemo(() => new Map(offices.map((office) => [office.id, office.name])), [offices]);

  const rows = useMemo(
    () =>
      sections.map((section) => ({
        ...section,
        officeName: officeMap.get(section.office_id) || 'Unknown',
      })),
    [sections, officeMap]
  );

  const columns = [
    { key: 'name', label: 'Section / Room' },
    { key: 'officeName', label: 'Office' },
    {
      key: 'is_active',
      label: 'Status',
      render: (value: boolean) => (value === false ? 'Inactive' : 'Active'),
    },
  ];

  const actions = (row: OfficeSubLocation) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => {
            setEditingSection(row);
            setFormOpen(true);
          }}
        >
          <Pencil className="h-4 w-4 mr-2" /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive"
          onClick={() => {
            if (confirm(`Delete section "${row.name}"?`)) {
              deleteSection.mutate(row.id || row._id || '');
            }
          }}
        >
          <Trash2 className="h-4 w-4 mr-2" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const handleSubmit = async (data: SectionFormData) => {
    if (editingSection) {
      await updateSection.mutateAsync({
        id: editingSection.id || editingSection._id || '',
        data: { name: data.name },
      });
      return;
    }
    await createSection.mutateAsync({
      office_id: data.officeId,
      name: data.name,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[860px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Rooms / Sections</DialogTitle>
          <DialogDescription>Create and maintain office-specific rooms/sections.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2 w-full sm:w-[360px]">
            <Label>Office Filter</Label>
            <Select value={selectedOfficeId} onValueChange={setSelectedOfficeId}>
              <SelectTrigger><SelectValue placeholder="All offices" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>All offices</SelectItem>
                {offices.map((office) => (
                  <SelectItem key={office.id} value={office.id}>{office.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => {
              setEditingSection(null);
              setFormOpen(true);
            }}
          >
            Add Section
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            searchPlaceholder="Search sections..."
            useGlobalPageSearch={false}
            actions={actions}
          />
        )}

        <SectionFormModal
          open={formOpen}
          onOpenChange={setFormOpen}
          offices={offices}
          section={editingSection}
          onSubmit={handleSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}

