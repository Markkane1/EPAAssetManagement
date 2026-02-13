import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Eye, Pencil, UserPlus, Loader2, History, QrCode } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AssetItem } from "@/types";
import { useAssetItems, useCreateAssetItem, useUpdateAssetItem } from "@/hooks/useAssetItems";
import { useAssets } from "@/hooks/useAssets";
import { useLocations } from "@/hooks/useLocations";
import { useAssignments, useCreateAssignment } from "@/hooks/useAssignments";
import { useEmployees } from "@/hooks/useEmployees";
import { useProjects } from "@/hooks/useProjects";
import { useSchemes } from "@/hooks/useSchemes";
import { AssetItemFormModal } from "@/components/forms/AssetItemFormModal";
import { AssetItemEditModal } from "@/components/forms/AssetItemEditModal";
import { AssignmentHistoryModal } from "@/components/shared/AssignmentHistoryModal";
import { QRCodeModal } from "@/components/shared/QRCodeModal";
import { AssignmentFormModal } from "@/components/forms/AssignmentFormModal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function AssetItems() {
  const { data: assetItems, isLoading, error } = useAssetItems();
  const { data: assets } = useAssets();
  const { data: locations } = useLocations();
  const { data: assignments } = useAssignments();
  const { data: employees } = useEmployees();
  const { data: projects } = useProjects();
  const { data: schemes } = useSchemes();
  const createAssetItem = useCreateAssetItem();
  const updateAssetItem = useUpdateAssetItem();
  const createAssignment = useCreateAssignment();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editModal, setEditModal] = useState<{ open: boolean; item: AssetItem | null }>({
    open: false,
    item: null,
  });
  const [detailModal, setDetailModal] = useState<{ open: boolean; item: any | null }>({
    open: false,
    item: null,
  });
  const [assignmentModal, setAssignmentModal] = useState<{ open: boolean; item: AssetItem | null }>({
    open: false,
    item: null,
  });
  const [historyModal, setHistoryModal] = useState<{ open: boolean; item: any | null }>({
    open: false,
    item: null,
  });
  const [qrModal, setQrModal] = useState<{ open: boolean; item: any | null }>({
    open: false,
    item: null,
  });

  const assetItemList = assetItems || [];
  const assetList = assets || [];
  const locationList = locations || [];
  const assignmentList = assignments || [];
  const employeeList = employees || [];

  const assetById = new Map(assetList.map((asset) => [asset.id, asset]));
  const projectById = new Map((projects || []).map((project) => [project.id, project]));
  const schemeById = new Map((schemes || []).map((scheme) => [scheme.id, scheme]));

  const getSourceLabel = (item: AssetItem) => {
    const asset = assetById.get(item.asset_id);

    if (asset?.asset_source === "project") {
      const projectName = asset.project_id ? projectById.get(asset.project_id)?.name : null;
      const schemeName = asset.scheme_id ? schemeById.get(asset.scheme_id)?.name : null;

      if (projectName && schemeName) {
        return `${projectName} + ${schemeName}`;
      }

      return projectName || schemeName || "Project";
    }

    if (asset?.asset_source === "procurement") {
      return "Procurement";
    }

    return item.item_source || "N/A";
  };

  const enrichedItems = assetItemList.map((item) => ({
    ...item,
    assetName: assetById.get(item.asset_id)?.name || "N/A",
    locationName: locationList.find((l) => l.id === item.location_id)?.name || "N/A",
  }));

  const columns = [
    { key: "tag", label: "Tag", render: (value: string) => <span className="font-mono font-medium text-primary">{value}</span> },
    { key: "assetName", label: "Asset", render: (value: string, row: any) => (
      <div><p className="font-medium">{value}</p><p className="text-xs text-muted-foreground">{row.serial_number}</p></div>
    )},
    { key: "locationName", label: "Location" },
    { key: "item_status", label: "Status", render: (value: string) => <StatusBadge status={value || ""} /> },
    { key: "assignment_status", label: "Assignment", render: (value: string) => <StatusBadge status={value || ""} /> },
    { key: "functional_status", label: "Functional", render: (value: string) => <StatusBadge status={value || ""} /> },
    { key: "item_source", label: "Source", render: (_value: string, row: AssetItem) => (
      <span className="text-sm text-muted-foreground">{getSourceLabel(row)}</span>
    ) },
    { key: "warranty_expiry", label: "Warranty", render: (value: string | undefined) => {
      if (!value) return <span className="text-muted-foreground">N/A</span>;
      const expiry = new Date(value);
      return <span className={expiry < new Date() ? "text-destructive" : "text-muted-foreground"}>{expiry.toLocaleDateString()}</span>;
    }},
  ];

  const handleAddItem = () => {
    setIsModalOpen(true);
  };

  const handleSubmit = async (data: {
    assetId: string;
    locationId: string;
    itemStatus: string;
    itemCondition: string;
    functionalStatus: string;
    notes?: string;
    items: Array<{ serialNumber: string; warrantyExpiry?: string }>;
  }) => {
    await createAssetItem.mutateAsync(data);
  };

  const handleEditSubmit = async (data: {
    assetId: string;
    locationId: string;
    serialNumber?: string | null;
    warrantyExpiry?: string | null;
    itemStatus: string;
    itemCondition: string;
    functionalStatus: string;
    notes?: string;
  }) => {
    if (!editModal.item) return;
    await updateAssetItem.mutateAsync({ id: editModal.item.id, data });
    setEditModal({ open: false, item: null });
  };

  const handleAssignmentSubmit = async (data: any) => {
    await createAssignment.mutateAsync(data);
  };

  const actions = (row: any) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setDetailModal({ open: true, item: row })}><Eye className="h-4 w-4 mr-2" /> View Details</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setEditModal({ open: true, item: row })}><Pencil className="h-4 w-4 mr-2" /> Edit</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setHistoryModal({ open: true, item: row })}>
          <History className="h-4 w-4 mr-2" /> Assignment History
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setQrModal({ open: true, item: row })}>
          <QrCode className="h-4 w-4 mr-2" /> Generate QR Code
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setAssignmentModal({ open: true, item: row })}><UserPlus className="h-4 w-4 mr-2" /> Assign to Employee</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (isLoading) return <MainLayout title="Asset Items" description="Track individual asset instances"><div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div></MainLayout>;
  if (error) console.warn("API unavailable:", error);

  return (
    <MainLayout title="Asset Items" description="Track individual asset instances">
      <PageHeader 
        title="Asset Items" 
        description="View and manage individual asset items by serial number and tag" 
        action={{ label: "Add Item", onClick: handleAddItem }} 
      />
      <DataTable columns={columns} data={enrichedItems} searchPlaceholder="Search by tag, serial number..." actions={actions} />

      <AssetItemFormModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        assets={assetList as any}
        locations={locationList as any}
        onSubmit={handleSubmit}
      />

      <AssetItemEditModal
        open={editModal.open}
        onOpenChange={(open) => setEditModal({ open, item: open ? editModal.item : null })}
        assetItem={editModal.item}
        assets={assetList as any}
        locations={locationList as any}
        onSubmit={handleEditSubmit}
      />

      {detailModal.item && (
        <Dialog open={detailModal.open} onOpenChange={(open) => setDetailModal({ open, item: open ? detailModal.item : null })}>
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>Asset Item Details</DialogTitle>
              <DialogDescription>
                View key information for this asset item.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Tag</span>
                <span className="font-mono font-medium">{detailModal.item.tag || "N/A"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Asset</span>
                <span className="font-medium">{detailModal.item.assetName || "N/A"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Serial Number</span>
                <span>{detailModal.item.serial_number || "N/A"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Location</span>
                <span>{detailModal.item.locationName || "N/A"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <span>{detailModal.item.item_status || "N/A"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Condition</span>
                <span>{detailModal.item.item_condition || "N/A"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Functional Status</span>
                <span>{detailModal.item.functional_status || "N/A"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Assignment</span>
                <span>{detailModal.item.assignment_status || "N/A"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Warranty Expiry</span>
                <span>
                  {detailModal.item.warranty_expiry
                    ? new Date(detailModal.item.warranty_expiry).toLocaleDateString()
                    : "N/A"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Notes</span>
                <span className="text-right">{detailModal.item.notes || "N/A"}</span>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <AssignmentFormModal
        open={assignmentModal.open}
        onOpenChange={(open) => setAssignmentModal({ open, item: open ? assignmentModal.item : null })}
        assetItems={assetItemList as any}
        employees={employeeList as any}
        assets={assetList as any}
        selectedAssetItem={assignmentModal.item}
        onSubmit={handleAssignmentSubmit}
      />

      {/* Assignment History Modal */}
      {historyModal.item && (
        <AssignmentHistoryModal
          open={historyModal.open}
          onOpenChange={(open) => setHistoryModal({ ...historyModal, open })}
          type="assetItem"
          targetId={historyModal.item.id}
          targetName={historyModal.item.tag || historyModal.item.serial_number || "Asset Item"}
          assignments={assignmentList}
          assetItems={assetItemList}
          employees={employeeList}
          assets={assetList}
        />
      )}

      {/* QR Code Modal */}
      {qrModal.item && (
        <QRCodeModal
          open={qrModal.open}
          onOpenChange={(open) => setQrModal({ ...qrModal, open })}
          tag={qrModal.item.tag || "N/A"}
          assetName={qrModal.item.assetName || "Unknown Asset"}
          serialNumber={qrModal.item.serial_number}
        />
      )}
    </MainLayout>
  );
}
