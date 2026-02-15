import { FormEvent, useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Eye, Upload } from "lucide-react";
import { useTransfers, useCreateTransfer, useTransferAction } from "@/hooks/useTransfers";
import { useAssetItems } from "@/hooks/useAssetItems";
import { useAssets } from "@/hooks/useAssets";
import { useLocations } from "@/hooks/useLocations";
import { useAuth } from "@/contexts/AuthContext";
import type { AssetItem, Transfer, TransferStatus } from "@/types";
import { AssetStatus } from "@/types";
import { RecordDetailModal } from "@/components/records/RecordDetailModal";
import { documentService } from "@/services/documentService";
import { documentLinkService } from "@/services/documentLinkService";
import { toast } from "sonner";
import { getOfficeHolderId } from "@/lib/assetItemHolder";

type TransferRow = Transfer & {
  lineCount: number;
  assetsPreview: string;
  fromOfficeName: string;
  toOfficeName: string;
};

type TransferAction =
  | "approve"
  | "dispatch_to_store"
  | "receive_at_store"
  | "dispatch_to_dest"
  | "receive_at_dest";

type RequiredDocumentType = "handover" | "takeover";

const WORKFLOW_ACTIONS: Record<
  Exclude<TransferStatus, "RECEIVED_AT_DEST" | "REJECTED" | "CANCELLED">,
  { action: TransferAction; label: string; requiresDocument?: RequiredDocumentType }
> = {
  REQUESTED: { action: "approve", label: "Approve" },
  APPROVED: { action: "dispatch_to_store", label: "Dispatch To Store", requiresDocument: "handover" },
  DISPATCHED_TO_STORE: { action: "receive_at_store", label: "Receive At Store" },
  RECEIVED_AT_STORE: { action: "dispatch_to_dest", label: "Dispatch To Destination" },
  DISPATCHED_TO_DEST: { action: "receive_at_dest", label: "Receive At Destination", requiresDocument: "takeover" },
};

function pickFile(accept = ".pdf,.jpg,.jpeg,.png") {
  return new Promise<File | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] || null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export default function Transfers() {
  const { role, isOrgAdmin, locationId } = useAuth();
  const { data: transfers = [], isLoading, error } = useTransfers();
  const { data: assetItems = [] } = useAssetItems();
  const { data: assets = [] } = useAssets();
  const { data: locations = [] } = useLocations();
  const createTransfer = useCreateTransfer();
  const transferAction = useTransferAction();

  const [fromOfficeId, setFromOfficeId] = useState(locationId || "");
  const [toOfficeId, setToOfficeId] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedAssetItemIds, setSelectedAssetItemIds] = useState<string[]>([]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [recordModal, setRecordModal] = useState<{ open: boolean; transferId?: string; label?: string }>({
    open: false,
  });

  const locationById = useMemo(
    () => new Map(locations.map((location) => [location.id, location])),
    [locations]
  );
  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const assetItemById = useMemo(
    () => new Map(assetItems.map((item) => [item.id, item])),
    [assetItems]
  );

  const canManage = isOrgAdmin || role === "office_head" || role === "caretaker";

  const transferableItems = useMemo(
    () =>
      assetItems.filter((item) => {
        if (!getOfficeHolderId(item)) return false;
        if (item.assignment_status !== "Unassigned") return false;
        if (item.item_status === AssetStatus.InTransit || item.item_status === AssetStatus.Retired) return false;
        return true;
      }),
    [assetItems]
  );

  const filteredItems = useMemo(
    () => transferableItems.filter((item) => getOfficeHolderId(item) === fromOfficeId),
    [transferableItems, fromOfficeId]
  );

  const tableRows: TransferRow[] = useMemo(
    () =>
      transfers.map((transfer) => {
        const lines = Array.isArray(transfer.lines)
          ? transfer.lines
          // Back-compat for legacy transfer records before lines[] migration.
          : transfer.asset_item_id
            ? [{ asset_item_id: transfer.asset_item_id }]
            : [];

        const preview = lines
          .slice(0, 2)
          .map((line) => {
            const item = line.asset_item_id ? assetItemById.get(line.asset_item_id) : undefined;
            const assetName = item ? assetById.get(item.asset_id)?.name || "Unknown Asset" : "Unknown Asset";
            const tag = item?.tag || item?.serial_number || "Unlabeled";
            return `${tag} (${assetName})`;
          })
          .join(", ");

        return {
          ...transfer,
          lineCount: lines.length,
          assetsPreview:
            lines.length > 2 ? `${preview} +${lines.length - 2} more` : preview || "N/A",
          fromOfficeName: locationById.get(transfer.from_office_id)?.name || "N/A",
          toOfficeName: locationById.get(transfer.to_office_id)?.name || "N/A",
        };
      }),
    [transfers, assetById, assetItemById, locationById]
  );

  const toggleAssetSelection = (assetItemId: string) => {
    setSelectedAssetItemIds((current) =>
      current.includes(assetItemId) ? current.filter((id) => id !== assetItemId) : [...current, assetItemId]
    );
  };

  const resetForm = () => {
    setSelectedAssetItemIds([]);
    setToOfficeId("");
    setNotes("");
  };

  const handleCreateTransfer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!fromOfficeId || !toOfficeId) {
      toast.error("From and destination offices are required");
      return;
    }
    if (fromOfficeId === toOfficeId) {
      toast.error("Destination office must be different from source office");
      return;
    }
    if (selectedAssetItemIds.length === 0) {
      toast.error("Select at least one asset item");
      return;
    }

    await createTransfer.mutateAsync({
      fromOfficeId,
      toOfficeId,
      lines: selectedAssetItemIds.map((assetItemId) => ({ assetItemId })),
      notes: notes.trim() || undefined,
    });

    resetForm();
  };

  const uploadTransferDocument = async (transfer: Transfer, documentType: RequiredDocumentType) => {
    const file = await pickFile();
    if (!file) return null;

    const isHandover = documentType === "handover";
    const officeId = isHandover ? transfer.from_office_id : transfer.to_office_id;
    const titlePrefix = isHandover ? "Handover" : "Takeover";

    const document = await documentService.create({
      title: `${titlePrefix} Report - Transfer ${transfer.id}`,
      docType: "TransferChallan",
      status: "Final",
      officeId,
    });

    await documentService.upload(document.id, file);

    try {
      await documentLinkService.create({
        documentId: document.id,
        entityType: "Transfer",
        entityId: transfer.id,
        requiredForStatus: "Completed",
      });
    } catch {
      // Transfer stage transition still uses direct transfer document ids.
    }

    return document.id;
  };

  const runWorkflowAction = async (row: TransferRow) => {
    const workflow = WORKFLOW_ACTIONS[row.status as keyof typeof WORKFLOW_ACTIONS];
    if (!workflow) return;

    setUpdatingId(row.id);
    try {
      if (workflow.requiresDocument === "handover") {
        const documentId = await uploadTransferDocument(row, "handover");
        if (!documentId) return;
        await transferAction.mutateAsync({ id: row.id, action: workflow.action, handoverDocumentId: documentId });
        return;
      }
      if (workflow.requiresDocument === "takeover") {
        const documentId = await uploadTransferDocument(row, "takeover");
        if (!documentId) return;
        await transferAction.mutateAsync({ id: row.id, action: workflow.action, takeoverDocumentId: documentId });
        return;
      }
      await transferAction.mutateAsync({ id: row.id, action: workflow.action });
    } finally {
      setUpdatingId(null);
    }
  };

  const openRecordModal = (row: TransferRow) => {
    setRecordModal({
      open: true,
      transferId: row.id,
      label: `Transfer ${row.id}`,
    });
  };

  const columns = [
    {
      key: "lineCount",
      label: "Lines",
      render: (value: number) => <span className="font-medium">{value}</span>,
    },
    {
      key: "assetsPreview",
      label: "Asset Items",
      render: (value: string) => <span className="text-sm">{value || "N/A"}</span>,
    },
    { key: "fromOfficeName", label: "From" },
    { key: "toOfficeName", label: "To" },
    {
      key: "transfer_date",
      label: "Date",
      render: (value: string) => (value ? new Date(value).toLocaleDateString() : "N/A"),
    },
    {
      key: "status",
      label: "Status",
      render: (value: string) => <StatusBadge status={value || ""} />,
    },
    {
      key: "notes",
      label: "Notes",
      render: (value: string) => <span className="text-sm text-muted-foreground">{value || "-"}</span>,
    },
  ];

  const actions = (row: TransferRow) => {
    const workflow = WORKFLOW_ACTIONS[row.status as keyof typeof WORKFLOW_ACTIONS];
    const canReject = canManage && (row.status === "REQUESTED" || row.status === "APPROVED");
    const canCancel =
      canManage &&
      (row.status === "REQUESTED" ||
        row.status === "APPROVED" ||
        row.status === "DISPATCHED_TO_STORE" ||
        row.status === "RECEIVED_AT_STORE" ||
        row.status === "DISPATCHED_TO_DEST");

    return (
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => openRecordModal(row)}>
          <Eye className="mr-2 h-3.5 w-3.5" />
          File
        </Button>

        {canManage && workflow && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => runWorkflowAction(row)}
            disabled={transferAction.isPending && updatingId === row.id}
          >
            {transferAction.isPending && updatingId === row.id && (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            )}
            {workflow.requiresDocument && <Upload className="mr-2 h-3.5 w-3.5" />}
            {workflow.label}
          </Button>
        )}

        {canReject && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => transferAction.mutate({ id: row.id, action: "reject" })}
            disabled={transferAction.isPending}
          >
            Reject
          </Button>
        )}

        {canCancel && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => transferAction.mutate({ id: row.id, action: "cancel" })}
            disabled={transferAction.isPending}
          >
            Cancel
          </Button>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <MainLayout title="Transfers" description="Mediated asset transfers via system store">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  if (error) {
    console.warn("API unavailable:", error);
  }

  const destinationOffices = locations.filter((office) => office.id !== fromOfficeId);

  return (
    <MainLayout title="Transfers" description="Mediated asset transfers via system store">
      <PageHeader
        title="Transfers"
        description="Create transfer requests with multiple lines and track the store-mediated workflow"
      />

      {canManage ? (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <form onSubmit={handleCreateTransfer} className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fromOffice">From Office *</Label>
                  <select
                    id="fromOffice"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={fromOfficeId}
                    onChange={(event) => {
                      setFromOfficeId(event.target.value);
                      setSelectedAssetItemIds([]);
                      if (toOfficeId === event.target.value) setToOfficeId("");
                    }}
                    disabled={!isOrgAdmin && Boolean(locationId)}
                  >
                    <option value="">Select office</option>
                    {locations.map((office) => (
                      <option key={office.id} value={office.id}>
                        {office.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="toOffice">Destination Office *</Label>
                  <select
                    id="toOffice"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={toOfficeId}
                    onChange={(event) => setToOfficeId(event.target.value)}
                  >
                    <option value="">Select destination office</option>
                    {destinationOffices.map((office) => (
                      <option key={office.id} value={office.id}>
                        {office.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Transfer Lines (Asset Items) *</Label>
                <div className="max-h-64 space-y-2 overflow-auto rounded-md border p-3">
                  {filteredItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No transferable asset items for selected source office.</p>
                  ) : (
                    filteredItems.map((item: AssetItem) => {
                      const asset = assetById.get(item.asset_id);
                      const itemLabel = item.tag || item.serial_number || item.id;
                      return (
                        <label key={item.id} className="flex items-center gap-3 rounded-sm px-2 py-1 hover:bg-muted/40">
                          <Checkbox
                            checked={selectedAssetItemIds.includes(item.id)}
                            onCheckedChange={() => toggleAssetSelection(item.id)}
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{itemLabel}</p>
                            <p className="truncate text-xs text-muted-foreground">{asset?.name || "Unknown Asset"}</p>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Selected: {selectedAssetItemIds.length}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Input id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={createTransfer.isPending}>
                  {createTransfer.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Transfer Request
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card className="mb-6">
          <CardContent className="py-4 text-sm text-muted-foreground">
            You have read-only access to transfer records.
          </CardContent>
        </Card>
      )}

      <DataTable columns={columns} data={tableRows} searchPlaceholder="Search transfers..." actions={actions} />

      <RecordDetailModal
        open={recordModal.open}
        onOpenChange={(open) => (open ? null : setRecordModal({ open: false }))}
        lookup={{ recordType: "TRANSFER", transferId: recordModal.transferId }}
        title={recordModal.label ? `Transfer File - ${recordModal.label}` : "Transfer File"}
      />
    </MainLayout>
  );
}
