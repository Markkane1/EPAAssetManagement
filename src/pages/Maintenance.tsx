import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Eye, Pencil, CheckCircle, XCircle, Loader2 } from "lucide-react";
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

export default function Maintenance() {
  const { data: maintenanceRecords, isLoading, error } = useMaintenance();
  const { data: assetItems } = useAssetItems();
  const { data: assets } = useAssets();
  const createMaintenance = useCreateMaintenance();
  const completeMaintenance = useCompleteMaintenance();
  const updateMaintenance = useUpdateMaintenance();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMaintenance, setEditingMaintenance] = useState<MaintenanceRecord | null>(null);

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

  const actions = (row: MaintenanceRecord & { assetName: string; itemTag: string }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem>
          <Eye className="h-4 w-4 mr-2" /> View Details
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleEdit(row)}>
          <Pencil className="h-4 w-4 mr-2" /> Edit
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
    </MainLayout>
  );
}

