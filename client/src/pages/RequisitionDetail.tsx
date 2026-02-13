import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { requisitionService } from "@/services/requisitionService";
import { assetItemService } from "@/services/assetItemService";
import { useLocations } from "@/hooks/useLocations";
import { useAuth } from "@/contexts/AuthContext";
import type { AssetItem, Office, RequisitionLine } from "@/types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";
const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "");

const FULFILLABLE_STATUSES = new Set([
  "VERIFIED_APPROVED",
  "IN_FULFILLMENT",
  "PARTIALLY_FULFILLED",
]);

function asId<T extends { id?: string; _id?: string }>(row: T): string {
  return String(row.id || row._id || "");
}

function isHqDirectorateOffice(officeId: string, offices: Office[]) {
  const office = offices.find((entry) => entry.id === officeId);
  if (!office) return false;
  if (office.is_headoffice) return true;
  if (!office.parent_location_id) return false;
  const parent = offices.find((entry) => entry.id === office.parent_location_id);
  return Boolean(parent?.is_headoffice);
}

function buildApiUrl(path: string | null | undefined) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/")) return `${API_ORIGIN}${path}`;
  return `${API_ORIGIN}/${path}`;
}

async function downloadProtectedFile(fileUrl: string, fallbackName: string) {
  const response = await fetch(fileUrl, { method: "GET", credentials: "include" });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Failed download (${response.status})`);
  }
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = fallbackName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);
}

type FulfillDraft = Record<
  string,
  {
    assignedAssetItemIds: string[];
    issuedQuantity: string;
  }
>;

export default function RequisitionDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const { data: locations } = useLocations();
  const locationList = locations || [];

  const [rejectRemarks, setRejectRemarks] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [fulfillDraft, setFulfillDraft] = useState<FulfillDraft>({});
  const [pickerLineId, setPickerLineId] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [signedIssuanceFile, setSignedIssuanceFile] = useState<File | null>(null);

  const requisitionQuery = useQuery({
    queryKey: ["requisition", id],
    queryFn: () => requisitionService.getById(String(id)),
    enabled: Boolean(id),
  });

  const requisition = requisitionQuery.data?.requisition;
  const lines = requisitionQuery.data?.lines || [];
  const issuingOfficeId = String(requisition?.issuing_office_id || requisition?.office_id || "");
  const officeId = String(requisition?.office_id || "");
  const officeName =
    locationList.find((entry) => entry.id === officeId)?.name || officeId || "N/A";

  const canIssuerAct = useMemo(() => {
    const hqDirectorate = isHqDirectorateOffice(officeId, locationList);
    if (hqDirectorate) {
      return role === "caretaker" || role === "assistant_caretaker";
    }
    return role === "location_admin";
  }, [officeId, locationList, role]);

  const canVerifyReject =
    canIssuerAct && String(requisition?.status || "") === "PENDING_VERIFICATION";
  const canFulfill =
    canIssuerAct && FULFILLABLE_STATUSES.has(String(requisition?.status || ""));

  const assetItemsQuery = useQuery({
    queryKey: ["asset-items", "by-location", issuingOfficeId],
    queryFn: () => assetItemService.getByLocation(issuingOfficeId),
    enabled: canFulfill && Boolean(issuingOfficeId),
  });

  const officeStockItems = useMemo(() => {
    const entries = assetItemsQuery.data || [];
    return entries.filter((item) => item.assignment_status !== "Assigned");
  }, [assetItemsQuery.data]);

  const selectedAssetsAcrossLines = useMemo(() => {
    const set = new Set<string>();
    Object.entries(fulfillDraft).forEach(([lineId, value]) => {
      if (lineId !== pickerLineId) {
        value.assignedAssetItemIds.forEach((assetId) => set.add(assetId));
      }
    });
    return set;
  }, [fulfillDraft, pickerLineId]);

  const pickerItems = useMemo(() => {
    const token = pickerSearch.trim().toLowerCase();
    if (!token) return officeStockItems;
    return officeStockItems.filter((item) => {
      const haystack = `${item.tag || ""} ${item.serial_number || ""} ${item.id}`.toLowerCase();
      return haystack.includes(token);
    });
  }, [officeStockItems, pickerSearch]);

  const hasAnyFulfillment = useMemo(
    () => lines.some((line) => Number(line.fulfilled_quantity || 0) > 0),
    [lines]
  );

  const verifyMutation = useMutation({
    mutationFn: (decision: "VERIFY" | "REJECT") =>
      requisitionService.verify(String(id), {
        decision,
        remarks: decision === "REJECT" ? rejectRemarks.trim() : undefined,
      }),
    onSuccess: async () => {
      toast.success("Requisition updated.");
      setShowRejectInput(false);
      setRejectRemarks("");
      await queryClient.invalidateQueries({ queryKey: ["requisition", id] });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update requisition."),
  });

  const fulfillMutation = useMutation({
    mutationFn: async () => {
      const payloadLines = lines
        .map((line) => {
          const lineId = asId(line);
          const draft = fulfillDraft[lineId] || { assignedAssetItemIds: [], issuedQuantity: "" };
          const parsedQty = Number(draft.issuedQuantity);
          const hasMoveable = draft.assignedAssetItemIds.length > 0;
          const hasConsumable = Number.isFinite(parsedQty) && parsedQty > 0;
          if (!hasMoveable && !hasConsumable) return null;
          return {
            lineId,
            assignedAssetItemIds: draft.assignedAssetItemIds.length > 0 ? draft.assignedAssetItemIds : undefined,
            issuedQuantity: hasConsumable ? parsedQty : undefined,
          };
        })
        .filter((entry): entry is { lineId: string; assignedAssetItemIds?: string[]; issuedQuantity?: number } => Boolean(entry));

      if (payloadLines.length === 0) {
        throw new Error("Select at least one moveable item or consumable quantity to fulfill.");
      }
      return requisitionService.fulfill(String(id), { lines: payloadLines });
    },
    onSuccess: async () => {
      toast.success("Fulfillment submitted.");
      setFulfillDraft({});
      await queryClient.invalidateQueries({ queryKey: ["requisition", id] });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to fulfill requisition."),
  });

  const signedUploadMutation = useMutation({
    mutationFn: async () => {
      if (!signedIssuanceFile) throw new Error("Select a signed issuance report file first.");
      const form = new FormData();
      form.append("signedIssuanceFile", signedIssuanceFile);
      return requisitionService.uploadSignedIssuance(String(id), form);
    },
    onSuccess: async () => {
      toast.success("Signed issuance uploaded.");
      setSignedIssuanceFile(null);
      await queryClient.invalidateQueries({ queryKey: ["requisition", id] });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to upload signed issuance."),
  });

  const openAssetPicker = (line: RequisitionLine) => {
    const lineId = asId(line);
    if (!lineId) return;
    setPickerLineId(lineId);
    setPickerSearch("");
  };

  const toggleAssetForLine = (lineId: string, assetId: string, checked: boolean) => {
    setFulfillDraft((previous) => {
      const current = previous[lineId] || { assignedAssetItemIds: [], issuedQuantity: "" };
      const nextSet = new Set(current.assignedAssetItemIds);
      if (checked) nextSet.add(assetId);
      else nextSet.delete(assetId);
      return {
        ...previous,
        [lineId]: {
          ...current,
          assignedAssetItemIds: Array.from(nextSet),
        },
      };
    });
  };

  const setIssuedQuantity = (lineId: string, value: string) => {
    setFulfillDraft((previous) => {
      const current = previous[lineId] || { assignedAssetItemIds: [], issuedQuantity: "" };
      return {
        ...previous,
        [lineId]: {
          ...current,
          issuedQuantity: value,
        },
      };
    });
  };

  if (requisitionQuery.isLoading) {
    return (
      <MainLayout title="Requisition Detail" description="View requisition details and workflow">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  if (requisitionQuery.isError || !requisition) {
    return (
      <MainLayout title="Requisition Detail" description="View requisition details and workflow">
        <Card>
          <CardHeader>
            <CardTitle>Unable to load requisition</CardTitle>
            <CardDescription>Check the requisition ID and try again.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => navigate("/requisitions")}>
              Back to Requisitions
            </Button>
          </CardContent>
        </Card>
      </MainLayout>
    );
  }

  const requisitionFormUrl = buildApiUrl(requisitionQuery.data?.documents?.requisitionForm?.latestVersion?.file_url || null);
  const issueSlipUrl = buildApiUrl(requisitionQuery.data?.documents?.issueSlip?.latestVersion?.file_url || null);

  return (
    <MainLayout title="Requisition Detail" description="View requisition details and workflow">
      <PageHeader
        title={`Requisition ${requisition.file_number}`}
        description="Review verification, fulfillment, and signature status."
        action={{ label: "Back to List", onClick: () => navigate("/requisitions") }}
      />

      <div className="mt-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Header</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">File Number</p>
              <p className="font-medium">{requisition.file_number}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <Badge variant="outline" className="mt-1 font-mono">
                {requisition.status}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Created At</p>
              <p className="font-medium">{new Date(requisition.created_at).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Office</p>
              <p className="font-medium">{officeName}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Requisition Form</CardTitle>
            <CardDescription>Original submitted attachment.</CardDescription>
          </CardHeader>
          <CardContent>
            {requisitionFormUrl ? (
              <Button
                variant="outline"
                onClick={() =>
                  downloadProtectedFile(
                    requisitionFormUrl,
                    `requisition-form-${requisition.file_number}.pdf`
                  ).catch((error) => toast.error(error.message || "Failed to download requisition form."))
                }
              >
                Download Requisition Attachment
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Attachment link not available.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lines</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-2 py-2 text-left font-medium">Requested Name</th>
                    <th className="px-2 py-2 text-left font-medium">Line Type</th>
                    <th className="px-2 py-2 text-right font-medium">Requested Qty</th>
                    <th className="px-2 py-2 text-right font-medium">Fulfilled Qty</th>
                    <th className="px-2 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={asId(line)} className="border-b last:border-0">
                      <td className="px-2 py-2">{line.requested_name}</td>
                      <td className="px-2 py-2">{line.line_type}</td>
                      <td className="px-2 py-2 text-right">{line.requested_quantity}</td>
                      <td className="px-2 py-2 text-right">{line.fulfilled_quantity}</td>
                      <td className="px-2 py-2">{line.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
            <CardDescription>Role-gated requisition workflow actions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {!canIssuerAct && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Read-only access</AlertTitle>
                <AlertDescription>
                  Your role cannot verify or fulfill this requisition for the selected office type.
                </AlertDescription>
              </Alert>
            )}

            {canVerifyReject && (
              <div className="rounded-md border p-4 space-y-3">
                <p className="font-medium">Verification</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() => verifyMutation.mutate("VERIFY")}
                    disabled={verifyMutation.isPending}
                  >
                    {verifyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Verify Approved
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setShowRejectInput((previous) => !previous)}
                    disabled={verifyMutation.isPending}
                  >
                    Reject Invalid
                  </Button>
                </div>

                {showRejectInput && (
                  <div className="space-y-2">
                    <Label htmlFor="rejectRemarks">Reject Remarks (required)</Label>
                    <Textarea
                      id="rejectRemarks"
                      value={rejectRemarks}
                      onChange={(event) => setRejectRemarks(event.target.value)}
                      rows={3}
                      placeholder="Provide rejection reason"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => {
                        if (!rejectRemarks.trim()) {
                          toast.error("Reject remarks are required.");
                          return;
                        }
                        verifyMutation.mutate("REJECT");
                      }}
                      disabled={verifyMutation.isPending}
                    >
                      Confirm Reject
                    </Button>
                  </div>
                )}
              </div>
            )}

            {canFulfill && (
              <div className="rounded-md border p-4 space-y-4">
                <p className="font-medium">Fulfillment</p>
                {assetItemsQuery.isLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading office stock...
                  </div>
                )}

                {lines.map((line) => {
                  const lineId = asId(line);
                  const draft = fulfillDraft[lineId] || {
                    assignedAssetItemIds: [],
                    issuedQuantity: "",
                  };
                  return (
                    <div key={`fulfill-${lineId}`} className="rounded border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-sm">{line.requested_name}</p>
                        <Badge variant="outline">{line.line_type}</Badge>
                      </div>

                      {line.line_type === "MOVEABLE" ? (
                        <div className="space-y-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openAssetPicker(line)}
                          >
                            Select Asset Items ({draft.assignedAssetItemIds.length})
                          </Button>
                          {draft.assignedAssetItemIds.length > 0 && (
                            <p className="text-xs text-muted-foreground break-all">
                              {draft.assignedAssetItemIds.join(", ")}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Label>Issue Quantity</Label>
                          <Input
                            type="number"
                            min={0}
                            value={draft.issuedQuantity}
                            onChange={(event) => setIssuedQuantity(lineId, event.target.value)}
                            placeholder="0"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}

                <Button
                  type="button"
                  onClick={() => fulfillMutation.mutate()}
                  disabled={fulfillMutation.isPending}
                >
                  {fulfillMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Submit Fulfillment
                </Button>
              </div>
            )}

            {hasAnyFulfillment && (
              <div className="rounded-md border p-4 space-y-3">
                <p className="font-medium">Issuance Report</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    if (!id) return;
                    try {
                      const blob = await requisitionService.downloadIssuanceReportPdf(id);
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement("a");
                      link.href = url;
                      link.download = `issuance-report-${requisition.file_number}.pdf`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      URL.revokeObjectURL(url);
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Failed to download issuance report.");
                    }
                  }}
                >
                  Download Issuance Report PDF
                </Button>

                {String(requisition.status) === "FULFILLED_PENDING_SIGNATURE" && (
                  <div className="space-y-2">
                    <Label htmlFor="signedIssuance">Upload Signed Issuance Report (PDF/JPG/PNG)</Label>
                    <Input
                      id="signedIssuance"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                      onChange={(event) => setSignedIssuanceFile(event.target.files?.[0] || null)}
                    />
                    <Button
                      type="button"
                      onClick={() => signedUploadMutation.mutate()}
                      disabled={signedUploadMutation.isPending}
                    >
                      {signedUploadMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Upload Signed Issuance Report
                    </Button>
                  </div>
                )}

                {String(requisition.status) === "FULFILLED" && issueSlipUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      downloadProtectedFile(
                        issueSlipUrl,
                        `signed-issuance-${requisition.file_number}.pdf`
                      ).catch((error) => toast.error(error.message || "Failed to download signed issuance report."))
                    }
                  >
                    Download Signed Issuance Report
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(pickerLineId)} onOpenChange={(open) => (!open ? setPickerLineId(null) : null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Select Asset Items</DialogTitle>
            <DialogDescription>
              Choose moveable asset items from the issuing office stock.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Search by tag, serial number, or ID"
              value={pickerSearch}
              onChange={(event) => setPickerSearch(event.target.value)}
            />

            <div className="max-h-80 overflow-y-auto rounded-md border p-2 space-y-1">
              {pickerItems.length === 0 ? (
                <p className="p-2 text-sm text-muted-foreground">No asset items found.</p>
              ) : (
                pickerItems.map((item: AssetItem) => {
                  const lineId = pickerLineId || "";
                  const selectedForLine =
                    fulfillDraft[lineId]?.assignedAssetItemIds.includes(item.id) || false;
                  const disabledByOtherLine =
                    !selectedForLine && selectedAssetsAcrossLines.has(item.id);
                  return (
                    <label
                      key={item.id}
                      className="flex items-start gap-2 rounded p-2 hover:bg-muted/40"
                    >
                      <Checkbox
                        checked={selectedForLine}
                        disabled={disabledByOtherLine}
                        onCheckedChange={(checked) =>
                          toggleAssetForLine(lineId, item.id, Boolean(checked))
                        }
                      />
                      <div className="text-sm">
                        <p className="font-medium">{item.tag || "No Tag"}</p>
                        <p className="text-xs text-muted-foreground">
                          Serial: {item.serial_number || "N/A"} | ID: {item.id}
                        </p>
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            <div className="flex justify-end">
              <Button type="button" onClick={() => setPickerLineId(null)}>
                Done
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
