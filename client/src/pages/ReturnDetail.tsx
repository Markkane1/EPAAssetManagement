import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { returnRequestService } from "@/services/returnRequestService";
import { useEmployees } from "@/hooks/useEmployees";
import { useLocations } from "@/hooks/useLocations";
import { useAssetItems } from "@/hooks/useAssetItems";
import { useAssets } from "@/hooks/useAssets";
import { useAuth } from "@/contexts/AuthContext";
import { ReturnRequestStatus } from "@/types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";
const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "");

const ISSUER_ROLES = new Set([
  "super_admin",
  "admin",
  "location_admin",
  "caretaker",
  "assistant_caretaker",
]);

const RECEIVE_ALLOWED_STATUSES = new Set([
  ReturnRequestStatus.Submitted,
  ReturnRequestStatus.ReceivedConfirmed,
]);

function buildApiUrl(path: string | null | undefined) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/")) return `${API_ORIGIN}${path}`;
  return `${API_ORIGIN}/${path}`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function downloadProtectedFile(fileUrl: string, fallbackName: string) {
  const response = await fetch(fileUrl, { method: "GET", credentials: "include" });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Failed download (${response.status})`);
  }
  const blob = await response.blob();
  downloadBlob(blob, fallbackName);
}

export default function ReturnDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const { data: employees } = useEmployees();
  const { data: locations } = useLocations();
  const { data: assetItems } = useAssetItems();
  const { data: assets } = useAssets();

  const [signedFile, setSignedFile] = useState<File | null>(null);

  const detailQuery = useQuery({
    queryKey: ["return-request", id],
    queryFn: () => returnRequestService.getById(String(id)),
    enabled: Boolean(id),
  });

  const returnRequest = detailQuery.data?.returnRequest;
  const lines = detailQuery.data?.lines || [];
  const currentStatus = String(returnRequest?.status || "");
  const canIssuerAct = Boolean(role && ISSUER_ROLES.has(role));
  const canReceive = canIssuerAct && RECEIVE_ALLOWED_STATUSES.has(currentStatus as ReturnRequestStatus);
  const canUploadSigned =
    canIssuerAct && currentStatus === ReturnRequestStatus.ClosedPendingSignature;
  const canDownloadReceipt =
    currentStatus === ReturnRequestStatus.ClosedPendingSignature ||
    currentStatus === ReturnRequestStatus.Closed ||
    Boolean(returnRequest?.receipt_document_id);
  const backPath = canIssuerAct ? "/returns" : "/assignments";

  const employeeName = useMemo(() => {
    const employeeId = String(returnRequest?.employee_id || "");
    if (!employeeId) return "N/A";
    const employee = (employees || []).find((entry) => entry.id === employeeId);
    if (!employee) return employeeId;
    return `${employee.first_name} ${employee.last_name}`.trim() || employee.email;
  }, [employees, returnRequest?.employee_id]);

  const officeName = useMemo(() => {
    const officeId = String(returnRequest?.office_id || "");
    if (!officeId) return "N/A";
    const office = (locations || []).find((entry) => entry.id === officeId);
    return office?.name || officeId;
  }, [locations, returnRequest?.office_id]);

  const lineRows = useMemo(() => {
    const assetItemMap = new Map((assetItems || []).map((item) => [item.id, item]));
    const assetMap = new Map((assets || []).map((asset) => [asset.id, asset]));
    return lines.map((line) => {
      const assetItemId = String(line.asset_item_id || "");
      const item = assetItemMap.get(assetItemId);
      const asset = item ? assetMap.get(item.asset_id) : null;
      return {
        assetItemId,
        assetName: asset?.name || "Unknown Asset",
        tag: item?.tag || "N/A",
        serialNumber: item?.serial_number || "N/A",
      };
    });
  }, [lines, assetItems, assets]);

  const receiveMutation = useMutation({
    mutationFn: () => returnRequestService.receive(String(id)),
    onSuccess: async () => {
      toast.success("Return request received.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["return-request", id] }),
        queryClient.invalidateQueries({ queryKey: ["return-requests"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message || "Failed to receive return request."),
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!signedFile) {
        throw new Error("Select a signed return receipt file first.");
      }
      const form = new FormData();
      form.append("signedReturnFile", signedFile);
      return returnRequestService.uploadSignedReturn(String(id), form);
    },
    onSuccess: async () => {
      toast.success("Signed return receipt uploaded.");
      setSignedFile(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["return-request", id] }),
        queryClient.invalidateQueries({ queryKey: ["return-requests"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message || "Failed to upload signed return receipt."),
  });

  if (detailQuery.isLoading) {
    return (
      <MainLayout title="Return Request Detail" description="Review return request details and status">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  if (detailQuery.isError || !returnRequest) {
    return (
      <MainLayout title="Return Request Detail" description="Review return request details and status">
        <Card>
          <CardHeader>
            <CardTitle>Unable to load return request</CardTitle>
            <CardDescription>Check the request ID and try again.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => navigate(canIssuerAct ? "/returns" : "/assignments")}>
              Back
            </Button>
          </CardContent>
        </Card>
      </MainLayout>
    );
  }

  const receiptDocUrl = buildApiUrl(
    detailQuery.data?.documents?.receiptDocument?.latestVersion?.file_url || null
  );

  return (
    <MainLayout title="Return Request Detail" description="Review return request details and status">
      <PageHeader
        title={`Return Request ${returnRequest.id || returnRequest._id || ""}`}
        description="Confirm receipt, download receipt PDF, and upload signed receipt."
        action={{ label: "Back", onClick: () => navigate(backPath) }}
      />

      <div className="mt-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Header</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <Badge variant="outline" className="mt-1 font-mono">
                {currentStatus || "UNKNOWN"}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Employee</p>
              <p className="font-medium">{employeeName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Office</p>
              <p className="font-medium">{officeName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Created At</p>
              <p className="font-medium">
                {returnRequest.created_at ? new Date(returnRequest.created_at).toLocaleString() : "N/A"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lines</CardTitle>
            <CardDescription>Asset items requested for return.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-2 py-2 text-left font-medium">Asset Item ID</th>
                    <th className="px-2 py-2 text-left font-medium">Asset</th>
                    <th className="px-2 py-2 text-left font-medium">Tag</th>
                    <th className="px-2 py-2 text-left font-medium">Serial</th>
                  </tr>
                </thead>
                <tbody>
                  {lineRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-2 py-6 text-center text-muted-foreground">
                        No return lines found.
                      </td>
                    </tr>
                  ) : (
                    lineRows.map((line) => (
                      <tr key={line.assetItemId} className="border-b last:border-0">
                        <td className="px-2 py-2 font-mono text-xs">{line.assetItemId}</td>
                        <td className="px-2 py-2">{line.assetName}</td>
                        <td className="px-2 py-2">{line.tag}</td>
                        <td className="px-2 py-2">{line.serialNumber}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
            <CardDescription>Follow the strict receipt signature workflow.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!canIssuerAct && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Read-only access</AlertTitle>
                <AlertDescription>
                  Your role can review this return request, but cannot run issuer actions.
                </AlertDescription>
              </Alert>
            )}

            {canReceive && (
              <Button
                type="button"
                onClick={() => receiveMutation.mutate()}
                disabled={receiveMutation.isPending}
              >
                {receiveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Receive / Confirm Return
              </Button>
            )}

            {canDownloadReceipt && (
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  if (!id) return;
                  try {
                    const blob = await returnRequestService.downloadReturnReceiptPdf(id);
                    downloadBlob(blob, `return-receipt-${id}.pdf`);
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : "Failed to download return receipt."
                    );
                  }
                }}
              >
                Download Return Receipt PDF
              </Button>
            )}

            {canUploadSigned && (
              <div className="space-y-2 rounded-md border p-4">
                <Label htmlFor="signedReturnFile">Upload Signed Return Receipt (PDF/JPG/PNG)</Label>
                <Input
                  id="signedReturnFile"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  onChange={(event) => setSignedFile(event.target.files?.[0] || null)}
                />
                <Button
                  type="button"
                  onClick={() => uploadMutation.mutate()}
                  disabled={uploadMutation.isPending}
                >
                  {uploadMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Upload Signed Return Receipt
                </Button>
              </div>
            )}

            {currentStatus === ReturnRequestStatus.Closed && receiptDocUrl && (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  downloadProtectedFile(receiptDocUrl, `signed-return-receipt-${id}.pdf`).catch(
                    (error) => toast.error(error.message || "Failed to download signed return receipt.")
                  )
                }
              >
                Download Signed Return Receipt
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
