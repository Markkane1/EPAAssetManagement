import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTransfer } from "@/hooks/useTransfers";
import { useAssets } from "@/hooks/useAssets";
import { useAssetItems } from "@/hooks/useAssetItems";
import { useLocations } from "@/hooks/useLocations";
import { useIsMobile } from "@/hooks/use-mobile";

function formatDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
}

function displayOrDash(value?: string | null) {
  const text = String(value || "").trim();
  return text || "-";
}

export default function TransferDetail() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { id } = useParams<{ id: string }>();
  const { data: transfer, isLoading, isError } = useTransfer(id);
  const { data: assets = [] } = useAssets();
  const { data: assetItems = [] } = useAssetItems();
  const { data: locations = [] } = useLocations();

  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const assetItemById = useMemo(() => new Map(assetItems.map((item) => [item.id, item])), [assetItems]);
  const locationById = useMemo(() => new Map(locations.map((location) => [location.id, location])), [locations]);

  if (isLoading) {
    return (
      <MainLayout title="Transfer Detail" description="Review full transfer information">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  if (isError || !transfer) {
    return (
      <MainLayout title="Transfer Detail" description="Review full transfer information">
        <Card>
          <CardHeader>
            <CardTitle>Unable to load transfer</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => navigate("/transfers")}>
              Back to Transfers
            </Button>
          </CardContent>
        </Card>
      </MainLayout>
    );
  }

  const fromName =
    transfer.store_id && transfer.from_office_id === transfer.store_id
      ? "Central Store"
      : locationById.get(transfer.from_office_id)?.name || transfer.from_office_id;

  const toName =
    transfer.store_id && transfer.to_office_id === transfer.store_id
      ? "Central Store"
      : locationById.get(transfer.to_office_id)?.name || transfer.to_office_id;

  const lineRows = (transfer.lines || []).map((line, index) => {
    const item = line.asset_item_id ? assetItemById.get(line.asset_item_id) : undefined;
    const asset = item ? assetById.get(item.asset_id) : undefined;
    return {
      index: index + 1,
      id: line.asset_item_id || "-",
      tag: item?.tag || "-",
      serial: item?.serial_number || "-",
      assetName: asset?.name || "-",
      itemStatus: item?.item_status || "-",
      assignmentStatus: item?.assignment_status || "-",
      notes: line.notes || "-",
    };
  });

  const transferAny = transfer as Record<string, unknown>;
  const workflowRows = [
    ["Requested By", displayOrDash(transferAny.requested_by_user_id as string | null)],
    ["Requested At", formatDate(transferAny.requested_at as string | null)],
    ["Approved By", displayOrDash(transferAny.approved_by_user_id as string | null)],
    ["Approved At", formatDate(transferAny.approved_at as string | null)],
    ["Dispatched To Store By", displayOrDash(transferAny.dispatched_to_store_by_user_id as string | null)],
    ["Dispatched To Store At", formatDate(transferAny.dispatched_to_store_at as string | null)],
    ["Received At Store By", displayOrDash(transferAny.received_at_store_by_user_id as string | null)],
    ["Received At Store At", formatDate(transferAny.received_at_store_at as string | null)],
    ["Dispatched To Destination By", displayOrDash(transferAny.dispatched_to_dest_by_user_id as string | null)],
    ["Dispatched To Destination At", formatDate(transferAny.dispatched_to_dest_at as string | null)],
    ["Received At Destination By", displayOrDash(transferAny.received_at_dest_by_user_id as string | null)],
    ["Received At Destination At", formatDate(transferAny.received_at_dest_at as string | null)],
    ["Rejected By", displayOrDash(transferAny.rejected_by_user_id as string | null)],
    ["Rejected At", formatDate(transferAny.rejected_at as string | null)],
    ["Cancelled By", displayOrDash(transferAny.cancelled_by_user_id as string | null)],
    ["Cancelled At", formatDate(transferAny.cancelled_at as string | null)],
  ] as const;

  return (
    <MainLayout title="Transfer Detail" description="Review full transfer information">
      <PageHeader
        title={`Transfer ${transfer.id}`}
        description="Complete transfer header, line items, and workflow fields."
        action={{ label: "Back", onClick: () => navigate("/transfers") }}
      />

      <div className="mt-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <div className="mt-1">
                <StatusBadge status={transfer.status || ""} />
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">From</p>
              <p className="font-medium">{fromName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">To</p>
              <p className="font-medium">{toName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Transfer Date</p>
              <p className="font-medium">{formatDate(transfer.transfer_date)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Lines</p>
              <p className="font-medium">{lineRows.length}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Store</p>
              <p className="font-medium">{transfer.store_id ? "Central Store" : "-"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Handover Document</p>
              <p className="font-medium">{displayOrDash(transfer.handover_document_id)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Approval Order</p>
              <p className="font-medium">{displayOrDash(transfer.approval_order_document_id)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Takeover Document</p>
              <p className="font-medium">{displayOrDash(transfer.takeover_document_id)}</p>
            </div>
            <div className="md:col-span-2 lg:col-span-4">
              <p className="text-xs text-muted-foreground">Notes</p>
              <p className="font-medium">{displayOrDash(transfer.notes)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Created At</p>
              <p className="font-medium">{formatDate(transfer.created_at)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Updated At</p>
              <p className="font-medium">{formatDate(transfer.updated_at)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Transfer Lines</CardTitle>
          </CardHeader>
          <CardContent>
            {isMobile ? (
              <div className="space-y-3">
                {lineRows.length === 0 ? (
                  <div className="rounded-md border px-3 py-4 text-sm text-muted-foreground">
                    No transfer lines found.
                  </div>
                ) : (
                  lineRows.map((row) => (
                    <div key={`${row.id}-${row.index}`} className="rounded-md border p-3 space-y-2">
                      <p className="text-sm font-semibold">
                        #{row.index} {row.assetName}
                      </p>
                      <p className="text-xs text-muted-foreground break-all">Asset Item ID: {row.id}</p>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Tag</p>
                          <p>{row.tag}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Serial</p>
                          <p>{row.serial}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="mb-1 text-xs text-muted-foreground">Item Status</p>
                          <StatusBadge status={row.itemStatus} />
                        </div>
                        <div>
                          <p className="mb-1 text-xs text-muted-foreground">Assignment</p>
                          <StatusBadge status={row.assignmentStatus} />
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Line Notes</p>
                        <p className="text-sm break-words">{row.notes}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">Asset Item ID</th>
                      <th className="px-3 py-2 text-left">Tag</th>
                      <th className="px-3 py-2 text-left">Serial</th>
                      <th className="px-3 py-2 text-left">Asset</th>
                      <th className="px-3 py-2 text-left">Item Status</th>
                      <th className="px-3 py-2 text-left">Assignment</th>
                      <th className="px-3 py-2 text-left">Line Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineRows.length === 0 && (
                      <tr>
                        <td className="px-3 py-4 text-muted-foreground" colSpan={8}>
                          No transfer lines found.
                        </td>
                      </tr>
                    )}
                    {lineRows.map((row) => (
                      <tr key={`${row.id}-${row.index}`} className="border-t">
                        <td className="px-3 py-2">{row.index}</td>
                        <td className="px-3 py-2 font-mono text-xs">{row.id}</td>
                        <td className="px-3 py-2">{row.tag}</td>
                        <td className="px-3 py-2">{row.serial}</td>
                        <td className="px-3 py-2">{row.assetName}</td>
                        <td className="px-3 py-2">
                          <StatusBadge status={row.itemStatus} />
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge status={row.assignmentStatus} />
                        </td>
                        <td className="px-3 py-2">{row.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Workflow Metadata</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {workflowRows.map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="font-medium">{value}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
