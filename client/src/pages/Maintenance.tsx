import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Eye, Pencil, CheckCircle, XCircle, Loader2, FileUp } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MaintenanceRecord } from '@/types';
import { useMaintenance, useCreateMaintenance, useCompleteMaintenance, useUpdateMaintenance } from "@/hooks/useMaintenance";
import { useAssetItems } from "@/hooks/useAssetItems";
import { useAssets } from "@/hooks/useAssets";
import { MaintenanceFormModal } from "@/components/forms/MaintenanceFormModal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { documentService, documentLinkService } from "@/services";
import type { DocumentStatus, DocumentType } from "@/services/documentService";
import { RecordDetailModal } from "@/components/records/RecordDetailModal";
import { getOfficeHolderId } from "@/lib/assetItemHolder";

export default function Maintenance() {
  const { data: maintenanceRecords, isLoading, error } = useMaintenance();
  const { data: assetItems } = useAssetItems();
  const { data: assets } = useAssets();
  const createMaintenance = useCreateMaintenance();
  const completeMaintenance = useCompleteMaintenance();
  const updateMaintenance = useUpdateMaintenance();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMaintenance, setEditingMaintenance] = useState<MaintenanceRecord | null>(null);
  const [docModal, setDocModal] = useState<{ open: boolean; record: MaintenanceRecord | null }>({
    open: false,
    record: null,
  });
  const [docType, setDocType] = useState<DocumentType>('MaintenanceJobCard');
  const [docStatus, setDocStatus] = useState<DocumentStatus>('Final');
  const [docTitle, setDocTitle] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [docSubmitting, setDocSubmitting] = useState(false);
  const [recordModal, setRecordModal] = useState<{ open: boolean; record: MaintenanceRecord | null }>({
    open: false,
    record: null,
  });

  const maintenanceList = maintenanceRecords || [];
  const assetItemList = assetItems || [];
  const assetList = assets || [];

  const enrichedRecords = maintenanceList.map((record) => {
    const item = assetItemList.find((i) => i.id === record.asset_item_id);
    const asset = item ? assetList.find((a) => a.id === item.asset_id) : null;
    
    return {
      ...record,
      assetName: asset?.name || "N/A",
      itemTag: item?.tag || "N/A",
    };
  });

  const columns = [
    {
      key: "itemTag",
      label: "Asset Tag",
      render: (value: string) => (
        <span className="font-mono font-medium text-primary">{value}</span>
      ),
    },
    {
      key: "assetName",
      label: "Asset",
      render: (value: string) => (
        <span className="font-medium">{value}</span>
      ),
    },
    {
      key: "description",
      label: "Description",
      render: (value: string) => (
        <span className="text-sm max-w-[200px] truncate block">{value}</span>
      ),
    },
    {
      key: "maintenance_status",
      label: "Status",
      render: (value: string) => <StatusBadge status={value || ""} />,
    },
    {
      key: "scheduled_date",
      label: "Scheduled",
      render: (value: string | undefined) => {
        if (!value) return <span className="text-muted-foreground">—</span>;
        return new Date(value).toLocaleDateString();
      },
    },
    {
      key: "cost",
      label: "Cost",
      render: (value: number) => (
        <span className="font-medium">PKR {(value || 0).toLocaleString("en-PK")}</span>
      ),
    },
    {
      key: "performed_by",
      label: "Performed By",
      render: (value: string) => (
        <span className="text-muted-foreground">{value || "—"}</span>
      ),
    },
  ];

  const handleScheduleMaintenance = () => {
    setEditingMaintenance(null);
    setIsModalOpen(true);
  };

  const handleEdit = (record: MaintenanceRecord) => {
    setEditingMaintenance(record);
    setIsModalOpen(true);
  };

  const handleSubmit = async (data: any) => {
    if (editingMaintenance) {
      await updateMaintenance.mutateAsync({ id: editingMaintenance.id, data });
    } else {
      await createMaintenance.mutateAsync(data);
    }
  };

  const handleComplete = (id: string) => {
    completeMaintenance.mutate({ 
      id, 
      completedDate: new Date().toISOString(),
      notes: "Completed via dashboard"
    });
  };

  const handleCancel = (id: string) => {
    updateMaintenance.mutate({ 
      id, 
      data: { maintenanceStatus: 'Cancelled' }
    });
  };

  const openDocModal = (record: MaintenanceRecord) => {
    setDocModal({ open: true, record });
  };

  const openRecordModal = (record: MaintenanceRecord) => {
    setRecordModal({ open: true, record });
  };

  const closeDocModal = () => {
    setDocModal({ open: false, record: null });
    setDocType('MaintenanceJobCard');
    setDocStatus('Final');
    setDocTitle('');
    setDocFile(null);
    setDocError(null);
  };

  const closeRecordModal = () => {
    setRecordModal({ open: false, record: null });
  };

  const getAssetLabel = (record: MaintenanceRecord) => {
    const item = assetItemList.find((i) => i.id === record.asset_item_id);
    const asset = item ? assetList.find((a) => a.id === item.asset_id) : null;
    const tag = item?.tag || item?.serial_number || 'Asset Item';
    return asset ? `${asset.name} (${tag})` : tag;
  };

  const handleDocSubmit = async () => {
    if (!docModal.record) return;
    if (!docFile) {
      setDocError('Select a file to upload.');
      return;
    }
    setDocSubmitting(true);
    setDocError(null);
    try {
      const item = assetItemList.find((i) => i.id === docModal.record?.asset_item_id);
      const officeId = item ? getOfficeHolderId(item) || undefined : undefined;
      const title = docTitle.trim() || `${docType} - ${getAssetLabel(docModal.record)}`;

      const document = await documentService.create({
        title,
        docType,
        status: docStatus,
        officeId,
      });
      await documentService.upload(document.id, docFile);
      await documentLinkService.create({
        documentId: document.id,
        entityType: 'MaintenanceRecord',
        entityId: docModal.record.id,
      });
      toast.success('Document uploaded and linked.');
      closeDocModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to upload document';
      toast.error(message);
    } finally {
      setDocSubmitting(false);
    }
  };

  const actions = (row: MaintenanceRecord & { assetName: string; itemTag: string }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => openRecordModal(row)}>
          <Eye className="h-4 w-4 mr-2" /> Digital File
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleEdit(row)}>
          <Pencil className="h-4 w-4 mr-2" /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => openDocModal(row)}>
          <FileUp className="h-4 w-4 mr-2" /> Upload Docs
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {row.maintenance_status !== 'Completed' && (
          <DropdownMenuItem onClick={() => handleComplete(row.id)}>
            <CheckCircle className="h-4 w-4 mr-2" /> Mark Complete
          </DropdownMenuItem>
        )}
        {row.maintenance_status === 'Scheduled' && (
          <DropdownMenuItem 
            className="text-destructive"
            onClick={() => handleCancel(row.id)}
          >
            <XCircle className="h-4 w-4 mr-2" /> Cancel
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (isLoading) {
    return (
      <MainLayout title="Maintenance" description="Track asset maintenance and repairs">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  if (error) {
    console.warn("API unavailable:", error);
  }

  return (
    <MainLayout title="Maintenance" description="Track asset maintenance and repairs">
      <PageHeader
        title="Maintenance Records"
        description="Schedule and track maintenance activities for assets"
        action={{
          label: "Schedule Maintenance",
          onClick: handleScheduleMaintenance,
        }}
      />

      <DataTable
        columns={columns}
        data={enrichedRecords}
        searchPlaceholder="Search maintenance records..."
        actions={actions}
      />

      <MaintenanceFormModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        maintenance={editingMaintenance as any}
        assetItems={assetItemList as any}
        assets={assetList as any}
        onSubmit={handleSubmit}
      />

      {docModal.record && (
        <Dialog open={docModal.open} onOpenChange={(open) => (open ? null : closeDocModal())}>
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>Upload Maintenance Document</DialogTitle>
              <DialogDescription>
                Attach a job card or invoice before completing maintenance.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Document Type</Label>
                <Select value={docType} onValueChange={(value) => setDocType(value as DocumentType)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MaintenanceJobCard">Maintenance Job Card</SelectItem>
                    <SelectItem value="Invoice">Invoice</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Document Status</Label>
                <Select value={docStatus} onValueChange={(value) => setDocStatus(value as DocumentStatus)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="Final">Final</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="docTitle">Title</Label>
                <Input
                  id="docTitle"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder={`${docType} - ${getAssetLabel(docModal.record)}`}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="docFile">File *</Label>
                <Input
                  id="docFile"
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                />
                {docError && <p className="text-sm text-destructive">{docError}</p>}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={closeDocModal} disabled={docSubmitting}>
                  Cancel
                </Button>
                <Button onClick={handleDocSubmit} disabled={docSubmitting}>
                  {docSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Upload & Link
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <RecordDetailModal
        open={recordModal.open}
        onOpenChange={(open) => (open ? null : closeRecordModal())}
        lookup={{
          recordType: "MAINTENANCE",
          maintenanceRecordId: recordModal.record?.id,
        }}
        title={
          recordModal.record
            ? `Maintenance File - ${getAssetLabel(recordModal.record)}`
            : "Maintenance File"
        }
      />
    </MainLayout>
  );
}

