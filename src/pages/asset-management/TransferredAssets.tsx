import { useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Eye, Pencil, UserPlus, ArrowRightLeft, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AssetItem } from "@/types";
import { useAssetItems, useUpdateAssetItem } from "@/hooks/useAssetItems";
import { useAssets } from "@/hooks/useAssets";
import { useLocations } from "@/hooks/useLocations";
import { useAssignments, useCreateAssignment } from "@/hooks/useAssignments";
import { useEmployees } from "@/hooks/useEmployees";
import { useProjects } from "@/hooks/useProjects";
import { useSchemes } from "@/hooks/useSchemes";
import { AssetItemEditModal } from "@/components/forms/AssetItemEditModal";
import { TransferFormModal } from "@/components/forms/TransferFormModal";
import { AssignmentFormModal } from "@/components/forms/AssignmentFormModal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateTransfer } from "@/hooks/useTransfers";
import { useAuth } from "@/contexts/AuthContext";
import { isHeadOfficeLocation } from "@/lib/locationUtils";
import { toast } from "sonner";

export default function TransferredAssets() {
  const { role, locationId, user } = useAuth();
  const { data: assetItems, isLoading, error } = useAssetItems();
  const { data: assets } = useAssets();
  const { data: locations } = useLocations();
  const { data: assignments } = useAssignments();
  const { data: employees } = useEmployees();
  const { data: projects } = useProjects();
  const { data: schemes } = useSchemes();
  const updateAssetItem = useUpdateAssetItem();
  const createTransfer = useCreateTransfer();
  const createAssignment = useCreateAssignment();

  const [editModal, setEditModal] = useState<{ open: boolean; item: AssetItem | null }>({
    open: false,
    item: null,
  });
  const [detailModal, setDetailModal] = useState<{ open: boolean; item: any | null }>({
    open: false,
    item: null,
  });
  const [transferModal, setTransferModal] = useState<{ open: boolean; item: AssetItem | null }>({
    open: false,
    item: null,
  });
  const [assignmentModal, setAssignmentModal] = useState<{ open: boolean; item: AssetItem | null }>({
    open: false,
    item: null,
  });
  const [returnModal, setReturnModal] = useState<{ open: boolean; item: AssetItem | null }>({
    open: false,
    item: null,
  });
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split("T")[0]);
  const [returnPerformedBy, setReturnPerformedBy] = useState(user?.email || "");
  const [returnReason, setReturnReason] = useState("Return to Head Office");

  const assetItemList = assetItems || [];
  const assetList = assets || [];
  const locationList = locations || [];
  const assignmentList = assignments || [];
  const employeeList = employees || [];

  const assetById = new Map(assetList.map((asset) => [asset.id, asset]));
  const projectById = new Map((projects || []).map((project) => [project.id, project]));
  const schemeById = new Map((schemes || []).map((scheme) => [scheme.id, scheme]));
  const headOfficeLocation = locationList.find((location) => isHeadOfficeLocation(location));

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

  const filteredItems = useMemo(() => {
    const nonHeadOfficeItems = assetItemList.filter((item) => {
      const location = locationList.find((loc) => loc.id === item.location_id);
      return location && !isHeadOfficeLocation(location);
    });

    if (role === "location_admin") {
      if (!locationId) return [];
      return nonHeadOfficeItems.filter((item) => item.location_id === locationId);
    }

    return nonHeadOfficeItems;
  }, [assetItemList, locationList, role, locationId]);

  const enrichedItems = filteredItems.map((item) => ({
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
    { key: "item_condition", label: "Condition" },
    { key: "item_source", label: "Source", render: (_value: string, row: AssetItem) => (
      <span className="text-sm text-muted-foreground">{getSourceLabel(row)}</span>
    ) },
  ];

  const canModify = role === "admin" || role === "super_admin";
  const canReturn = canModify || role === "location_admin";

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

  const handleTransferSubmit = async (data: {
    assetItemIds: string[];
    fromLocationId: string;
    toLocationId: string;
    transferDate: string;
    reason: string;
    performedBy: string;
  }) => {
    await Promise.all(
      data.assetItemIds.map((assetItemId) =>
        createTransfer.mutateAsync({
          assetItemId,
          fromLocationId: data.fromLocationId,
          toLocationId: data.toLocationId,
          transferDate: data.transferDate,
          reason: data.reason,
          performedBy: data.performedBy,
        })
      )
    );
  };

  const handleAssignmentSubmit = async (data: any) => {
    await createAssignment.mutateAsync(data);
  };

  const openReturnModal = (item: AssetItem) => {
    setReturnDate(new Date().toISOString().split("T")[0]);
    setReturnPerformedBy(user?.email || "");
    setReturnReason("Return to Head Office");
    setReturnModal({ open: true, item });
  };

  const handleReturnSubmit = async () => {
    if (!returnModal.item) return;
    if (!headOfficeLocation) {
      toast.error("Head Office location not found");
      return;
    }
    if (!returnPerformedBy.trim()) {
      toast.error("Performed by is required");
      return;
    }
    if (!returnReason.trim()) {
      toast.error("Reason is required");
      return;
    }
    await createTransfer.mutateAsync({
      assetItemId: returnModal.item.id,
      fromLocationId: returnModal.item.location_id || "",
      toLocationId: headOfficeLocation.id,
      transferDate: returnDate,
      reason: returnReason,
      performedBy: returnPerformedBy,
    });
    setReturnModal({ open: false, item: null });
  };

  const actions = (row: any) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setDetailModal({ open: true, item: row })}><Eye className="h-4 w-4 mr-2" /> View Details</DropdownMenuItem>
        {canModify && (
          <>
            <DropdownMenuItem onClick={() => setEditModal({ open: true, item: row })}><Pencil className="h-4 w-4 mr-2" /> Edit</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setAssignmentModal({ open: true, item: row })}><UserPlus className="h-4 w-4 mr-2" /> Assign to Employee</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTransferModal({ open: true, item: row })}><ArrowRightLeft className="h-4 w-4 mr-2" /> Transfer Location</DropdownMenuItem>
          </>
        )}
        {canReturn && (
          <DropdownMenuItem onClick={() => openReturnModal(row)}>
            <ArrowRightLeft className="h-4 w-4 mr-2" /> Return to Head Office
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (isLoading) {
    return (
      <MainLayout title="Transferred Assets" description="Assets transferred to locations">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  if (error) console.warn("API unavailable:", error);

  return (
    <MainLayout title="Transferred Assets" description="Assets currently held at locations">
      <PageHeader
        title="Transferred Assets"
        description="Assets currently assigned to non-head office locations"
      />
      <DataTable columns={columns} data={enrichedItems} searchPlaceholder="Search tags, assets, locations..." actions={actions} />

      <AssetItemEditModal
        open={editModal.open}
        onOpenChange={(open) => setEditModal({ open, item: open ? editModal.item : null })}
        assetItem={editModal.item}
        assets={assetList as any}
        locations={locationList as any}
        onSubmit={handleEditSubmit}
      />

      <TransferFormModal
        open={transferModal.open}
        onOpenChange={(open) => setTransferModal({ open, item: open ? transferModal.item : null })}
        assetItems={assetItemList as any}
        locations={locationList as any}
        assets={assetList as any}
        selectedAssetItem={transferModal.item}
        onSubmit={handleTransferSubmit}
      />

      <AssignmentFormModal
        open={assignmentModal.open}
        onOpenChange={(open) => setAssignmentModal({ open, item: open ? assignmentModal.item : null })}
        assetItems={assetItemList as any}
        employees={employeeList as any}
        assets={assetList as any}
        selectedAssetItem={assignmentModal.item}
        onSubmit={handleAssignmentSubmit}
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
                <span className="text-muted-foreground">Notes</span>
                <span className="text-right">{detailModal.item.notes || "N/A"}</span>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {returnModal.item && (
        <Dialog open={returnModal.open} onOpenChange={(open) => setReturnModal({ open, item: open ? returnModal.item : null })}>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>Return Asset</DialogTitle>
              <DialogDescription>
                Send this asset back to head office.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Transfer Date</Label>
                <Input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Performed By</Label>
                <Input value={returnPerformedBy} onChange={(e) => setReturnPerformedBy(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Textarea value={returnReason} onChange={(e) => setReturnReason(e.target.value)} rows={2} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setReturnModal({ open: false, item: null })}>Cancel</Button>
                <Button onClick={handleReturnSubmit}>Return Asset</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </MainLayout>
  );
}
