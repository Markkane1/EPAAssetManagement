import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Eye, Upload, Check, ChevronsUpDown, X, FileText } from "lucide-react";
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
import { getOfficeHolderId, isStoreHolder } from "@/lib/assetItemHolder";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { SearchableSelect } from "@/components/shared/SearchableSelect";

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
const CENTRAL_STORE_SOURCE_ID = "HEAD_OFFICE_STORE";

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
  const navigate = useNavigate();
  const { role, isOrgAdmin, locationId } = useAuth();
  const { data: transfers = [], isLoading } = useTransfers();
  const { data: assetItems = [] } = useAssetItems();
  const { data: assets = [] } = useAssets();
  const { data: locations = [] } = useLocations();
  const createTransfer = useCreateTransfer();
  const transferAction = useTransferAction();

  const [fromOfficeId, setFromOfficeId] = useState(
    isOrgAdmin ? CENTRAL_STORE_SOURCE_ID : locationId || ""
  );
  const [toOfficeId, setToOfficeId] = useState("");
  const [notes, setNotes] = useState("");
  const [approvalOrderFile, setApprovalOrderFile] = useState<File | null>(null);
  const [selectedAssetItemIds, setSelectedAssetItemIds] = useState<string[]>([]);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [assetSearch, setAssetSearch] = useState("");
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

  useEffect(() => {
    if (!canManage) return;

    if (!isOrgAdmin) {
      if (!locationId) return;
      setFromOfficeId((current) => (current === locationId ? current : locationId));
      setToOfficeId((current) => (current === locationId ? "" : current));
      return;
    }

    setFromOfficeId((current) => current || CENTRAL_STORE_SOURCE_ID);
  }, [canManage, isOrgAdmin, locationId]);

  const transferableItems = useMemo(
    () =>
      assetItems.filter((item) => {
        const isUnassigned = !item.assignment_status || item.assignment_status === "Unassigned";
        if (!isUnassigned) return false;
        if (item.item_status === AssetStatus.InTransit || item.item_status === AssetStatus.Retired) return false;
        return true;
      }),
    [assetItems]
  );

  const filteredItems = useMemo(
    () =>
      transferableItems.filter((item) => {
        if (fromOfficeId === CENTRAL_STORE_SOURCE_ID) {
          return isStoreHolder(item);
        }
        return getOfficeHolderId(item) === fromOfficeId;
      }),
    [transferableItems, fromOfficeId]
  );

  const availableItems = useMemo(
    () => filteredItems.filter((item) => !selectedAssetItemIds.includes(item.id)),
    [filteredItems, selectedAssetItemIds]
  );

  const tableRows: TransferRow[] = useMemo(
    () =>
      transfers.map((transfer) => {
        const lines = Array.isArray(transfer.lines) ? transfer.lines : [];

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
          fromOfficeName:
            transfer.store_id && transfer.from_office_id === transfer.store_id
              ? "Central Store"
              : locationById.get(transfer.from_office_id)?.name || "N/A",
          toOfficeName:
            transfer.store_id && transfer.to_office_id === transfer.store_id
              ? "Central Store"
              : locationById.get(transfer.to_office_id)?.name || "N/A",
        };
      }),
    [transfers, assetById, assetItemById, locationById]
  );

  const toggleAssetSelection = (assetItemId: string) => {
    setSelectedAssetItemIds((current) =>
      current.includes(assetItemId) ? current.filter((id) => id !== assetItemId) : [...current, assetItemId]
    );
  };

  const selectedAssetItems = useMemo(
    () =>
      selectedAssetItemIds
        .map((id) => {
          const item = assetItemById.get(id);
          if (!item) return null;
          const asset = assetById.get(item.asset_id);
          return {
            id: item.id,
            label: item.tag || item.serial_number || item.id,
            assetName: asset?.name || "Unknown Asset",
          };
        })
        .filter((item): item is { id: string; label: string; assetName: string } => Boolean(item)),
    [selectedAssetItemIds, assetItemById, assetById]
  );

  const resetForm = () => {
    setSelectedAssetItemIds([]);
    setToOfficeId("");
    setNotes("");
    setApprovalOrderFile(null);
    setAssetSearch("");
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
    if (!approvalOrderFile) {
      toast.error("Approval Order attachment is required");
      return;
    }

    const approvalOfficeId = fromOfficeId === CENTRAL_STORE_SOURCE_ID ? toOfficeId : fromOfficeId;
    const approvalOrderDocument = await documentService.create({
      title: `Approval Order - Transfer Request ${new Date().toLocaleString()}`,
      docType: "Other",
      status: "Final",
      officeId: approvalOfficeId,
    });
    await documentService.upload(approvalOrderDocument.id, approvalOrderFile);

    const createdTransfer = await createTransfer.mutateAsync({
      fromOfficeId,
      toOfficeId,
      approvalOrderDocumentId: approvalOrderDocument.id,
      lines: selectedAssetItemIds.map((assetItemId) => ({ assetItemId })),
      notes: notes.trim() || undefined,
    });

    try {
      await documentLinkService.create({
        documentId: approvalOrderDocument.id,
        entityType: "Transfer",
        entityId: createdTransfer.id,
        requiredForStatus: "Approved",
      });
    } catch {
      // Record linkage should not block transfer creation.
    }

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
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => navigate(`/transfers/${row.id}`)}>
          <Eye className="mr-2 h-3.5 w-3.5" />
          Details
        </Button>

        <Button variant="outline" size="sm" onClick={() => openRecordModal(row)}>
          <FileText className="mr-2 h-3.5 w-3.5" />
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

  const destinationOffices = locations.filter((office) => office.id !== fromOfficeId);
  const showCentralDestination = fromOfficeId !== CENTRAL_STORE_SOURCE_ID;

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
                  <Label htmlFor="fromOffice">From Holder *</Label>
                  <SearchableSelect
                    id="fromOffice"
                    value={fromOfficeId}
                    onValueChange={(value) => {
                      setFromOfficeId(value);
                      setSelectedAssetItemIds([]);
                      setAssetSearch("");
                      if (toOfficeId === value) setToOfficeId("");
                    }}
                    disabled={!isOrgAdmin}
                    placeholder="Select source"
                    searchPlaceholder="Search holders..."
                    emptyText="No holders found."
                    options={[
                      ...(isOrgAdmin
                        ? [{ value: CENTRAL_STORE_SOURCE_ID, label: "Central Store" }]
                        : []),
                      ...locations.map((office) => ({ value: office.id, label: office.name })),
                    ]}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="toOffice">Destination Office *</Label>
                  <SearchableSelect
                    id="toOffice"
                    value={toOfficeId}
                    onValueChange={setToOfficeId}
                    placeholder="Select destination office"
                    searchPlaceholder="Search offices..."
                    emptyText="No offices found."
                    options={[
                      ...(showCentralDestination
                        ? [{ value: CENTRAL_STORE_SOURCE_ID, label: "Central Store" }]
                        : []),
                      ...destinationOffices.map((office) => ({ value: office.id, label: office.name })),
                    ]}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Transfer Lines (Asset Items) *</Label>
                <Popover open={assetPickerOpen} onOpenChange={setAssetPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between font-normal"
                    >
                      <span className="truncate text-left">
                        Search and select asset items...
                        {selectedAssetItemIds.length > 0 ? ` (${selectedAssetItemIds.length} selected)` : ""}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput
                        placeholder="Search by tag, serial, or asset name..."
                        value={assetSearch}
                        onValueChange={setAssetSearch}
                      />
                      <CommandList className="max-h-64">
                        <CommandEmpty>
                          {fromOfficeId === CENTRAL_STORE_SOURCE_ID
                            ? "No transferable asset items in Central Store."
                            : "No transferable asset items for selected source office."}
                        </CommandEmpty>
                        {availableItems.map((item: AssetItem) => {
                          const asset = assetById.get(item.asset_id);
                          const itemLabel = item.tag || item.serial_number || item.id;
                          const assetName = asset?.name || "Unknown Asset";
                          const isSelected = selectedAssetItemIds.includes(item.id);
                          return (
                            <CommandItem
                              key={item.id}
                              value={`${itemLabel} ${item.serial_number || ""} ${assetName}`}
                              onSelect={() => {
                                toggleAssetSelection(item.id);
                                setAssetSearch("");
                              }}
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{itemLabel}</p>
                                <p className="truncate text-xs text-muted-foreground">{assetName}</p>
                              </div>
                              <Check className={`ml-auto h-4 w-4 ${isSelected ? "opacity-100" : "opacity-0"}`} />
                            </CommandItem>
                          );
                        })}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-muted-foreground">Selected: {selectedAssetItemIds.length}</p>
                {selectedAssetItems.length > 0 && (
                  <div className="rounded-md border">
                    <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                      Selected Asset Items
                    </div>
                    <ul className="max-h-40 space-y-1 overflow-y-auto p-2">
                      {selectedAssetItems.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-center justify-between rounded-sm px-2 py-1.5 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium">{item.label}</p>
                            <p className="truncate text-xs text-muted-foreground">{item.assetName}</p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            onClick={() => toggleAssetSelection(item.id)}
                            aria-label={`Remove ${item.label}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="approvalOrderFile">Approval Order *</Label>
                <Input
                  id="approvalOrderFile"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(event) => setApprovalOrderFile(event.target.files?.[0] || null)}
                />
                {approvalOrderFile ? (
                  <p className="text-xs text-muted-foreground">Selected file: {approvalOrderFile.name}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Upload approval order before creating transfer.</p>
                )}
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

      <DataTable
        columns={columns}
        data={tableRows}
        searchPlaceholder="Search transfers..."
        actions={actions}
        virtualized
      />

      <RecordDetailModal
        open={recordModal.open}
        onOpenChange={(open) => (open ? null : setRecordModal({ open: false }))}
        lookup={{ recordType: "TRANSFER", transferId: recordModal.transferId }}
        title={recordModal.label ? `Transfer File - ${recordModal.label}` : "Transfer File"}
      />
    </MainLayout>
  );
}
