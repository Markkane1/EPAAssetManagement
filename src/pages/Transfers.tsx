import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Eye } from "lucide-react";
import { useTransfers, useCreateTransfer, useUpdateTransferStatus } from "@/hooks/useTransfers";
import { useAssetItems } from "@/hooks/useAssetItems";
import { useAssets } from "@/hooks/useAssets";
import { useLocations } from "@/hooks/useLocations";
import { useAuth } from "@/contexts/AuthContext";
import type { AssetItem, Transfer, TransferStatus } from "@/types";
import { RecordDetailModal } from "@/components/records/RecordDetailModal";

const transferSchema = z.object({
  assetItemId: z.string().min(1, "Asset item is required"),
  toOfficeId: z.string().min(1, "Destination is required"),
  transferDate: z.string().min(1, "Transfer date is required"),
  notes: z.string().optional(),
});

type TransferFormData = z.infer<typeof transferSchema>;

type TransferRow = Transfer & {
  assetName: string;
  assetTag: string;
  assetSerial: string;
  fromOfficeName: string;
  toOfficeName: string;
};

const nextStatusMap: Record<TransferStatus, TransferStatus | null> = {
  REQUESTED: "APPROVED",
  APPROVED: "DISPATCHED",
  DISPATCHED: "RECEIVED",
  RECEIVED: null,
};

const statusActionLabels: Record<TransferStatus, string> = {
  REQUESTED: "Approve",
  APPROVED: "Dispatch",
  DISPATCHED: "Receive",
  RECEIVED: "Completed",
};

export default function Transfers() {
  const { role, isSuperAdmin, locationId } = useAuth();
  const { data: transfers = [], isLoading, error } = useTransfers();
  const { data: assetItems = [] } = useAssetItems();
  const { data: assets = [] } = useAssets();
  const { data: locations = [] } = useLocations();
  const createTransfer = useCreateTransfer();
  const updateStatus = useUpdateTransferStatus();

  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [recordModal, setRecordModal] = useState<{ open: boolean; transferId?: string; label?: string }>({
    open: false,
  });

  const today = new Date().toISOString().slice(0, 10);

  const form = useForm<TransferFormData>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      assetItemId: "",
      toOfficeId: "",
      transferDate: today,
      notes: "",
    },
  });

  const locationById = useMemo(
    () => new Map(locations.map((location) => [location.id, location])),
    [locations]
  );

  const assetById = useMemo(
    () => new Map(assets.map((asset) => [asset.id, asset])),
    [assets]
  );

  const assetItemById = useMemo(
    () => new Map(assetItems.map((item) => [item.id, item])),
    [assetItems]
  );

  const currentOffice = locationId ? locationById.get(locationId) : undefined;
  const isHeadoffice = Boolean(currentOffice?.is_headoffice);
  const canManage = isSuperAdmin || role === "location_admin" || (role === "admin" && isHeadoffice);

  const selectedAssetItemId = form.watch("assetItemId");
  const selectedAssetItem = assetItems.find((item) => item.id === selectedAssetItemId);
  const fromOfficeId = selectedAssetItem?.location_id || "";
  const fromOfficeName = fromOfficeId ? locationById.get(fromOfficeId)?.name || "N/A" : "N/A";

  const transferableItems = assetItems.filter(
    (item) => item.assignment_status !== "Assigned" && Boolean(item.location_id)
  );
  const destinationOptions = locations.filter((loc) => loc.id !== fromOfficeId);

  const tableRows: TransferRow[] = transfers.map((transfer) => {
    const item = assetItemById.get(transfer.asset_item_id);
    const asset = item ? assetById.get(item.asset_id) : undefined;
    return {
      ...transfer,
      assetName: asset?.name || "N/A",
      assetTag: item?.tag || "N/A",
      assetSerial: item?.serial_number || "",
      fromOfficeName: locationById.get(transfer.from_office_id)?.name || "N/A",
      toOfficeName: locationById.get(transfer.to_office_id)?.name || "N/A",
    };
  });

  const columns = [
    {
      key: "assetTag",
      label: "Tag",
      render: (value: string) => (
        <span className="font-mono font-medium text-primary">{value}</span>
      ),
    },
    {
      key: "assetName",
      label: "Asset",
      render: (value: string, row: TransferRow) => (
        <div>
          <p className="font-medium">{value}</p>
          <p className="text-xs text-muted-foreground">{row.assetSerial || "-"}</p>
        </div>
      ),
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
      render: (value: string) => (
        <span className="text-sm text-muted-foreground">{value || "-"}</span>
      ),
    },
  ];

  const handleSubmit = async (data: TransferFormData) => {
    if (!selectedAssetItem?.location_id) {
      form.setError("assetItemId", { message: "Selected asset item has no location" });
      return;
    }

    if (data.toOfficeId === selectedAssetItem.location_id) {
      form.setError("toOfficeId", { message: "Destination must be different from source" });
      return;
    }

    await createTransfer.mutateAsync({
      assetItemId: data.assetItemId,
      fromOfficeId: selectedAssetItem.location_id,
      toOfficeId: data.toOfficeId,
      transferDate: data.transferDate,
      notes: data.notes || undefined,
      useWorkflow: true,
    });

    form.reset({
      assetItemId: "",
      toOfficeId: "",
      transferDate: today,
      notes: "",
    });
  };

  const handleAdvanceStatus = async (row: TransferRow) => {
    const nextStatus = nextStatusMap[row.status];
    if (!nextStatus) return;
    setUpdatingId(row.id);
    try {
      await updateStatus.mutateAsync({ id: row.id, data: { status: nextStatus } });
    } finally {
      setUpdatingId(null);
    }
  };

  const openRecordModal = (row: TransferRow) => {
    setRecordModal({
      open: true,
      transferId: row.id,
      label: `${row.assetName} (${row.assetTag || "Unlabeled"})`,
    });
  };

  const closeRecordModal = () => {
    setRecordModal({ open: false });
  };

  const actions = (row: TransferRow) => {
    const nextStatus = nextStatusMap[row.status];

    return (
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => openRecordModal(row)}>
          <Eye className="mr-2 h-3.5 w-3.5" />
          File
        </Button>
        {canManage && nextStatus && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleAdvanceStatus(row)}
            disabled={updateStatus.isPending && updatingId === row.id}
          >
            {updateStatus.isPending && updatingId === row.id && (
              <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
            )}
            {statusActionLabels[row.status] || "Update"}
          </Button>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <MainLayout title="Transfers" description="Move assets between offices">
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
    <MainLayout title="Transfers" description="Move assets between offices">
      <PageHeader
        title="Transfers"
        description="Request and track asset movements across offices"
      />

      {canManage ? (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Asset Item *</Label>
                  <Select
                    value={form.watch("assetItemId")}
                    onValueChange={(value) => form.setValue("assetItemId", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select asset item" />
                    </SelectTrigger>
                    <SelectContent>
                      {transferableItems.map((item: AssetItem) => {
                        const assetName = assetById.get(item.asset_id)?.name || "Unknown Asset";
                        const tagLabel = item.tag || item.serial_number || "Unlabeled";
                        return (
                          <SelectItem key={item.id} value={item.id}>
                            {tagLabel} - {assetName}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.assetItemId && (
                    <p className="text-sm text-destructive">{form.formState.errors.assetItemId.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>From Office</Label>
                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                    {fromOfficeName}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>To Office *</Label>
                  <Select
                    value={form.watch("toOfficeId")}
                    onValueChange={(value) => form.setValue("toOfficeId", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select destination" />
                    </SelectTrigger>
                    <SelectContent>
                      {destinationOptions.map((location) => (
                        <SelectItem key={location.id} value={location.id}>
                          {location.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.toOfficeId && (
                    <p className="text-sm text-destructive">{form.formState.errors.toOfficeId.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="transferDate">Transfer Date *</Label>
                  <Input id="transferDate" type="date" {...form.register("transferDate")} />
                  {form.formState.errors.transferDate && (
                    <p className="text-sm text-destructive">{form.formState.errors.transferDate.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Input id="notes" {...form.register("notes")} />
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={createTransfer.isPending}>
                  {createTransfer.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Request Transfer
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
      />

      <RecordDetailModal
        open={recordModal.open}
        onOpenChange={(open) => (open ? null : closeRecordModal())}
        lookup={{ recordType: "TRANSFER", transferId: recordModal.transferId }}
        title={recordModal.label ? `Transfer File - ${recordModal.label}` : "Transfer File"}
      />
    </MainLayout>
  );
}
