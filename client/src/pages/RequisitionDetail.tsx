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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { requisitionService } from "@/services/requisitionService";
import { assignmentService } from "@/services/assignmentService";
import { assetService } from "@/services/assetService";
import { consumableItemService } from "@/services/consumableItemService";
import { assetItemService } from "@/services/assetItemService";
import { useLocations } from "@/hooks/useLocations";
import { useOfficeSubLocations } from "@/hooks/useOfficeSubLocations";
import { useAuth } from "@/contexts/AuthContext";
import type { AssetItem, Assignment, Asset, ConsumableItem, Office, RequisitionLine } from "@/types";
import { useIsMobile } from "@/hooks/use-mobile";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";
const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "");

const FULFILLABLE_STATUSES = new Set([
  "APPROVED",
  "VERIFIED_APPROVED",
  "IN_FULFILLMENT",
  "PARTIALLY_FULFILLED",
]);

type WorkflowState = "pending" | "in_progress" | "done" | "blocked";

function getWorkflowStateLabel(state: WorkflowState) {
  if (state === "done") return "Done";
  if (state === "in_progress") return "In Progress";
  if (state === "blocked") return "Blocked";
  return "Pending";
}

function getWorkflowStateClassName(state: WorkflowState) {
  if (state === "done") return "bg-emerald-100 text-emerald-800";
  if (state === "in_progress") return "bg-blue-100 text-blue-800";
  if (state === "blocked") return "bg-red-100 text-red-800";
  return "bg-muted text-muted-foreground";
}

function asId<T extends { id?: string; _id?: string }>(row: T): string {
  return String(row.id || row._id || "");
}

function isHqDirectorateOffice(officeId: string, offices: Office[]) {
  const office = offices.find((entry) => entry.id === officeId);
  if (!office) return false;
  if (office.type === "HEAD_OFFICE" || office.type === "DIRECTORATE") return true;
  const parentId = office.parent_office_id;
  if (!parentId) return false;
  const parent = offices.find((entry) => entry.id === parentId);
  return parent?.type === "HEAD_OFFICE" || parent?.type === "DIRECTORATE";
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

async function downloadBlob(blob: Blob, fallbackName: string) {
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

type LineMapDraft = Record<
  string,
  {
    mapType: "MOVEABLE" | "CONSUMABLE";
    search: string;
    selectedId: string;
  }
>;

export default function RequisitionDetail() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const { data: locations } = useLocations();
  const locationList = useMemo(() => locations || [], [locations]);

  const [rejectRemarks, setRejectRemarks] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [fulfillDraft, setFulfillDraft] = useState<FulfillDraft>({});
  const [lineMapDraft, setLineMapDraft] = useState<LineMapDraft>({});
  const [pickerLineId, setPickerLineId] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [signedHandoverFiles, setSignedHandoverFiles] = useState<Record<string, File | null>>({});
  const [signedReturnFiles, setSignedReturnFiles] = useState<Record<string, File | null>>({});

  const requisitionQuery = useQuery({
    queryKey: ["requisition", id],
    queryFn: () => requisitionService.getById(String(id)),
    enabled: Boolean(id),
  });

  const requisition = requisitionQuery.data?.requisition;
  const lines = useMemo(() => requisitionQuery.data?.lines || [], [requisitionQuery.data?.lines]);
  const issuingOfficeId = String(requisition?.issuing_office_id || requisition?.office_id || "");
  const officeId = String(requisition?.office_id || "");
  const officeName =
    locationList.find((entry) => entry.id === officeId)?.name || officeId || "N/A";
  const { data: officeSubLocations = [] } = useOfficeSubLocations({
    officeId: officeId || undefined,
    includeInactive: true,
  });
  const linkedSubLocationName = useMemo(() => {
    const linkedId = String(requisition?.linked_sub_location_id || "");
    if (!linkedId) return "None";
    const room = officeSubLocations.find((entry) => String(entry.id || entry._id || "") === linkedId);
    return room?.name || linkedId;
  }, [officeSubLocations, requisition?.linked_sub_location_id]);

  const canVerifyRole = useMemo(() => {
    if (role === "org_admin") return true;
    const hqDirectorate = isHqDirectorateOffice(officeId, locationList);
    if (hqDirectorate) {
      return role === "office_head";
    }
    return role === "office_head";
  }, [officeId, locationList, role]);

  const canFulfillRole = useMemo(() => {
    if (role === "org_admin") return true;
    const hqDirectorate = isHqDirectorateOffice(officeId, locationList);
    if (hqDirectorate) {
      return role === "caretaker";
    }
    return role === "caretaker";
  }, [officeId, locationList, role]);

  const requisitionStatus = String(requisition?.status || "");
  const canVerifyReject =
    canVerifyRole && (requisitionStatus === "SUBMITTED" || requisitionStatus === "PENDING_VERIFICATION");
  const canFulfill =
    canFulfillRole && FULFILLABLE_STATUSES.has(requisitionStatus);
  const canIssuerAct = canVerifyRole || canFulfillRole;
  const canManageAssignmentSlips =
    role === "org_admin" || role === "office_head" || role === "caretaker";
  const canRequestReturn = role === "employee";

  const assetsQuery = useQuery({
    queryKey: ["assets", "map-for-requisition", officeId],
    queryFn: assetService.getAll,
    enabled: canFulfill,
  });
  const consumablesQuery = useQuery({
    queryKey: ["consumables", "map-for-requisition", officeId],
    queryFn: consumableItemService.getAll,
    enabled: canFulfill,
  });

  const assetItemsQuery = useQuery({
    queryKey: ["asset-items", "by-location", issuingOfficeId],
    queryFn: () => assetItemService.getByLocation(issuingOfficeId),
    enabled: canFulfill && Boolean(issuingOfficeId),
  });

  const assignmentsQuery = useQuery({
    queryKey: ["assignments", "requisition", id],
    queryFn: assignmentService.getAll,
    enabled: Boolean(id),
  });

  const officeStockItems = useMemo(() => {
    const entries = assetItemsQuery.data || [];
    return entries.filter((item) => item.assignment_status !== "Assigned");
  }, [assetItemsQuery.data]);

  const lineById = useMemo(() => {
    const map = new Map<string, RequisitionLine>();
    lines.forEach((line) => map.set(asId(line), line));
    return map;
  }, [lines]);

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
    const line = pickerLineId ? lineById.get(pickerLineId) : null;
    const mappedAssetId =
      line && line.line_type === "MOVEABLE" ? String(line.asset_id || "") : "";
    const token = pickerSearch.trim().toLowerCase();
    return officeStockItems.filter((item) => {
      if (!mappedAssetId || String(item.asset_id) !== mappedAssetId) return false;
      if (!token) return true;
      const haystack =
        `${line?.requested_name || ""} ${item.assets?.name || ""} ${item.tag || ""} ${
          item.serial_number || ""
        } ${item.id}`.toLowerCase();
      return haystack.includes(token);
    });
  }, [lineById, officeStockItems, pickerLineId, pickerSearch]);

  const assetList = useMemo(() => assetsQuery.data || [], [assetsQuery.data]);
  const consumableList = useMemo(() => consumablesQuery.data || [], [consumablesQuery.data]);

  const assetById = useMemo(() => {
    const map = new Map<string, Asset>();
    assetList.forEach((asset) => map.set(asset.id, asset));
    return map;
  }, [assetList]);

  const consumableById = useMemo(() => {
    const map = new Map<string, ConsumableItem>();
    consumableList.forEach((item) => map.set(item.id, item));
    return map;
  }, [consumableList]);

  const requisitionAssignments = useMemo(() => {
    const all = assignmentsQuery.data || [];
    return all.filter(
      (assignment) => String(assignment.requisition_id || "") === String(id || "")
    );
  }, [assignmentsQuery.data, id]);

  const assignmentsByLineId = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    requisitionAssignments.forEach((assignment) => {
      const lineId = String(assignment.requisition_line_id || "");
      if (!lineId) return;
      const existing = map.get(lineId) || [];
      existing.push(assignment);
      map.set(lineId, existing);
    });
    return map;
  }, [requisitionAssignments]);

  const officeStockItemById = useMemo(() => {
    const map = new Map<string, AssetItem>();
    officeStockItems.forEach((item) => map.set(String(item.id || ""), item));
    return map;
  }, [officeStockItems]);

  const workflowSnapshot = useMemo(() => {
    const status = String(requisitionStatus || "").toUpperCase();
    const isRejected = status === "REJECTED_INVALID";
    const verificationState: WorkflowState =
      isRejected
        ? "blocked"
        : status === "SUBMITTED" || status === "PENDING_VERIFICATION"
          ? "in_progress"
          : "done";
    const fulfillmentState: WorkflowState = isRejected
      ? "blocked"
      : status === "APPROVED" ||
          status === "VERIFIED_APPROVED" ||
          status === "IN_FULFILLMENT" ||
          status === "PARTIALLY_FULFILLED"
        ? "in_progress"
        : status === "FULFILLED_PENDING_SIGNATURE" || status === "FULFILLED"
          ? "done"
          : "pending";
    const signingState: WorkflowState = isRejected
      ? "blocked"
      : status === "FULFILLED_PENDING_SIGNATURE"
        ? "in_progress"
        : status === "FULFILLED"
          ? "done"
          : "pending";
    return [
      { id: "verify", label: "Verification", state: verificationState },
      { id: "fulfill", label: "Fulfillment", state: fulfillmentState },
      { id: "sign", label: "Signed Receipt", state: signingState },
    ];
  }, [requisitionStatus]);

  const fulfillmentSummary = useMemo(() => {
    const totalLines = lines.length;
    let mappedLines = 0;
    let readyLines = 0;
    let fulfilledLines = 0;
    lines.forEach((line) => {
      const lineId = asId(line);
      const draft = fulfillDraft[lineId] || { assignedAssetItemIds: [], issuedQuantity: "" };
      const isMapped =
        line.line_type === "MOVEABLE" ? Boolean(line.asset_id) : Boolean(line.consumable_id);
      if (isMapped) mappedLines += 1;
      if (Number(line.fulfilled_quantity || 0) > 0) fulfilledLines += 1;
      if (!isMapped) return;
      if (line.line_type === "MOVEABLE") {
        if (draft.assignedAssetItemIds.length > 0) readyLines += 1;
        return;
      }
      if (Number(draft.issuedQuantity) > 0) readyLines += 1;
    });
    return {
      totalLines,
      mappedLines,
      readyLines,
      fulfilledLines,
      canSubmit: readyLines > 0,
    };
  }, [fulfillDraft, lines]);

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
      await queryClient.invalidateQueries({ queryKey: ["requisitions"] });
      navigate("/requisitions");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update requisition."),
  });

  const mapLineMutation = useMutation({
    mutationFn: async (payload: {
      lineId: string;
      mapType: "MOVEABLE" | "CONSUMABLE";
      mappedId: string;
    }) => {
      if (payload.mapType === "MOVEABLE") {
        return requisitionService.mapLine(String(id), payload.lineId, {
          map_type: "MOVEABLE",
          asset_id: payload.mappedId,
        });
      }
      return requisitionService.mapLine(String(id), payload.lineId, {
        map_type: "CONSUMABLE",
        consumable_id: payload.mappedId,
      });
    },
    onSuccess: async () => {
      toast.success("Line mapped successfully.");
      await queryClient.invalidateQueries({ queryKey: ["requisition", id] });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to map line."),
  });

  const fulfillMutation = useMutation({
    mutationFn: async () => {
      const payloadLines = lines
        .map((line) => {
          const lineId = asId(line);
          const isMapped =
            line.line_type === "MOVEABLE" ? Boolean(line.asset_id) : Boolean(line.consumable_id);
          if (!isMapped) return null;
          const draft = fulfillDraft[lineId] || { assignedAssetItemIds: [], issuedQuantity: "" };
          const parsedQty = Number(draft.issuedQuantity);
          const hasMoveable = draft.assignedAssetItemIds.length > 0;
          const hasConsumable = Number.isFinite(parsedQty) && parsedQty > 0;
          if (!hasMoveable && !hasConsumable) return null;
          return {
            lineId,
            assignedAssetItemIds:
              draft.assignedAssetItemIds.length > 0 ? draft.assignedAssetItemIds : undefined,
            issuedQuantity: hasConsumable ? parsedQty : undefined,
          };
        })
        .filter(
          (
            entry
          ): entry is {
            lineId: string;
            assignedAssetItemIds?: string[];
            issuedQuantity?: number;
          } => Boolean(entry)
        );

      if (payloadLines.length === 0) {
        throw new Error("Map lines and select asset items/quantities before fulfillment.");
      }
      return requisitionService.fulfill(String(id), { lines: payloadLines });
    },
    onSuccess: async () => {
      toast.success("Fulfillment submitted.");
      setFulfillDraft({});
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["requisition", id] }),
        queryClient.invalidateQueries({ queryKey: ["assignments", "requisition", id] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message || "Failed to fulfill requisition."),
  });

  const uploadSignedHandoverMutation = useMutation({
    mutationFn: async ({ assignmentId, file }: { assignmentId: string; file: File }) => {
      const form = new FormData();
      form.append("signedHandoverFile", file);
      return assignmentService.uploadSignedHandoverSlip(assignmentId, form);
    },
    onSuccess: async () => {
      toast.success("Signed handover slip uploaded.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["requisition", id] }),
        queryClient.invalidateQueries({ queryKey: ["assignments", "requisition", id] }),
        queryClient.invalidateQueries({ queryKey: ["asset-items", "by-location", issuingOfficeId] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message || "Failed to upload signed handover slip."),
  });

  const requestReturnMutation = useMutation({
    mutationFn: (assignmentId: string) => assignmentService.requestReturn(assignmentId),
    onSuccess: async () => {
      toast.success("Return requested.");
      await queryClient.invalidateQueries({ queryKey: ["assignments", "requisition", id] });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to request return."),
  });

  const uploadSignedReturnMutation = useMutation({
    mutationFn: async ({ assignmentId, file }: { assignmentId: string; file: File }) => {
      const form = new FormData();
      form.append("signedReturnFile", file);
      return assignmentService.uploadSignedReturnSlip(assignmentId, form);
    },
    onSuccess: async () => {
      toast.success("Signed return slip uploaded.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["assignments", "requisition", id] }),
        queryClient.invalidateQueries({ queryKey: ["asset-items", "by-location", issuingOfficeId] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message || "Failed to upload signed return slip."),
  });

  const openAssetPicker = (line: RequisitionLine) => {
    if (line.line_type !== "MOVEABLE" || !line.asset_id) {
      toast.error("Map this line before fulfillment.");
      return;
    }
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

  const setMapSearch = (lineId: string, search: string) => {
    const fallbackType = lineById.get(lineId)?.line_type || "MOVEABLE";
    setLineMapDraft((previous) => ({
      ...previous,
      [lineId]: {
        mapType: previous[lineId]?.mapType || fallbackType,
        search,
        selectedId: previous[lineId]?.selectedId || "",
      },
    }));
  };

  const setMapType = (lineId: string, mapType: "MOVEABLE" | "CONSUMABLE") => {
    setLineMapDraft((previous) => ({
      ...previous,
      [lineId]: {
        mapType,
        search: previous[lineId]?.search || "",
        selectedId: "",
      },
    }));
  };

  const setMapSelection = (lineId: string, selectedId: string) => {
    const fallbackType = lineById.get(lineId)?.line_type || "MOVEABLE";
    setLineMapDraft((previous) => ({
      ...previous,
      [lineId]: {
        mapType: previous[lineId]?.mapType || fallbackType,
        search: previous[lineId]?.search || "",
        selectedId,
      },
    }));
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

  const requisitionFormUrl = buildApiUrl(
    requisitionQuery.data?.documents?.requisitionForm?.latestVersion?.file_url || null
  );

  return (
    <MainLayout title="Requisition Detail" description="View requisition details and workflow">
      <PageHeader
        title={`Requisition ${requisition.file_number}`}
        description="Review verification, mapping, fulfillment, and assignment slips."
        action={{ label: "Back to List", onClick: () => navigate("/requisitions") }}
      />

      <div className="mt-6 space-y-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Requisition Overview</CardTitle>
              <CardDescription>Core request information and current status.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">File Number</p>
                <p className="font-medium">{requisition.file_number}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <div className="mt-1">
                  <StatusBadge status={String(requisition.status || "UNKNOWN")} />
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Created At</p>
                <p className="font-medium">{new Date(requisition.created_at).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Office</p>
                <p className="font-medium">{officeName}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Room / Section</p>
                <p className="font-medium">{linkedSubLocationName}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Lines</p>
                <p className="font-medium">{lines.length}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Workflow Snapshot</CardTitle>
              <CardDescription>Progress of requisition lifecycle stages.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {workflowSnapshot.map((step) => (
                <div key={step.id} className="flex items-center justify-between rounded-md border p-2">
                  <p className="text-sm font-medium">{step.label}</p>
                  <Badge className={getWorkflowStateClassName(step.state)}>
                    {getWorkflowStateLabel(step.state)}
                  </Badge>
                </div>
              ))}
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md border p-2">
                  <p className="text-xs text-muted-foreground">Mapped</p>
                  <p className="font-semibold">
                    {fulfillmentSummary.mappedLines}/{fulfillmentSummary.totalLines}
                  </p>
                </div>
                <div className="rounded-md border p-2">
                  <p className="text-xs text-muted-foreground">Ready</p>
                  <p className="font-semibold">
                    {fulfillmentSummary.readyLines}/{fulfillmentSummary.totalLines}
                  </p>
                </div>
                <div className="rounded-md border p-2">
                  <p className="text-xs text-muted-foreground">Fulfilled</p>
                  <p className="font-semibold">
                    {fulfillmentSummary.fulfilledLines}/{fulfillmentSummary.totalLines}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

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
                  ).catch((error) =>
                    toast.error(error.message || "Failed to download requisition form.")
                  )
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
            <CardTitle>Requested Lines</CardTitle>
            <CardDescription>
              Requested items with requested, approved, and fulfilled quantities.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isMobile ? (
              <div className="space-y-3">
                {lines.map((line) => (
                  <div key={asId(line)} className="rounded-md border p-3 space-y-2">
                    <div className="space-y-1">
                      <p className="font-medium">{line.requested_name}</p>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{line.line_type}</Badge>
                        <StatusBadge status={String(line.status || "UNKNOWN")} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Requested</p>
                        <p className="font-medium">{line.requested_quantity}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Approved</p>
                        <p className="font-medium">{line.approved_quantity}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Fulfilled</p>
                        <p className="font-medium">{line.fulfilled_quantity}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="px-2 py-2 text-left font-medium">Item Name</th>
                      <th className="px-2 py-2 text-left font-medium">Line Type</th>
                      <th className="px-2 py-2 text-right font-medium">Item Quantity</th>
                      <th className="px-2 py-2 text-right font-medium">Approved Qty</th>
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
                        <td className="px-2 py-2 text-right">{line.approved_quantity}</td>
                        <td className="px-2 py-2 text-right">{line.fulfilled_quantity}</td>
                        <td className="px-2 py-2">
                          <StatusBadge status={String(line.status || "UNKNOWN")} />
                        </td>
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
            <CardTitle>Workflow Actions</CardTitle>
            <CardDescription>Verify, map, and fulfill this requisition based on your role.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {!canIssuerAct && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Read-only access</AlertTitle>
                <AlertDescription>
                  Your role cannot approve/reject or fulfill this requisition for the selected office type.
                </AlertDescription>
              </Alert>
            )}

            {canVerifyReject && (
              <div className="rounded-md border p-4 space-y-3">
                <p className="font-medium">Verification Decision</p>
                <p className="text-sm text-muted-foreground">
                  Office Head validates this request before it is available for fulfillment.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    className="w-full sm:w-auto"
                    onClick={() => verifyMutation.mutate("VERIFY")}
                    disabled={verifyMutation.isPending}
                  >
                    {verifyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Approve Requisition
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    className="w-full sm:w-auto"
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
                      className="w-full sm:w-auto"
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
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">Fulfillment Workspace</p>
                    <p className="text-sm text-muted-foreground">
                      Map each line, then select exact asset items or issued quantity.
                    </p>
                  </div>
                  <Badge variant="outline">
                    Ready {fulfillmentSummary.readyLines}/{fulfillmentSummary.totalLines}
                  </Badge>
                </div>
                {(assetsQuery.isLoading || consumablesQuery.isLoading || assetItemsQuery.isLoading) && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading mapping and stock data...
                  </div>
                )}

                {lines.map((line) => {
                  const lineId = asId(line);
                  const draft = fulfillDraft[lineId] || {
                    assignedAssetItemIds: [],
                    issuedQuantity: "",
                  };
                  const mapDraft = lineMapDraft[lineId] || {
                    mapType: line.line_type,
                    search: "",
                    selectedId: "",
                  };
                  const selectedMapType = mapDraft.mapType || line.line_type;
                  const isMapped =
                    line.line_type === "MOVEABLE"
                      ? Boolean(line.asset_id)
                      : Boolean(line.consumable_id);
                  const mappedId =
                    line.line_type === "MOVEABLE"
                      ? String(line.asset_id || "")
                      : String(line.consumable_id || "");
                  const mappedName =
                    line.line_type === "MOVEABLE"
                      ? assetById.get(mappedId)?.name || null
                      : consumableById.get(mappedId)?.name || null;
                  const lineReadyForSubmission =
                    line.line_type === "MOVEABLE"
                      ? draft.assignedAssetItemIds.length > 0
                      : Number(draft.issuedQuantity || 0) > 0;
                  const lineAssignments = assignmentsByLineId.get(lineId) || [];

                  const filteredMapOptions =
                    selectedMapType === "MOVEABLE"
                      ? assetList.filter((asset) =>
                          asset.name.toLowerCase().includes(mapDraft.search.trim().toLowerCase())
                        )
                      : consumableList.filter((item) =>
                          item.name.toLowerCase().includes(mapDraft.search.trim().toLowerCase())
                        );

                  return (
                    <div key={`fulfill-${lineId}`} className="rounded border p-3 space-y-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground">Requested Item</p>
                          <p className="font-semibold text-base">{line.requested_name}</p>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <span>Requested: {line.requested_quantity}</span>
                            <span>Approved: {line.approved_quantity}</span>
                            <span>Fulfilled: {line.fulfilled_quantity}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{line.line_type}</Badge>
                          <StatusBadge status={String(line.status || "UNKNOWN")} />
                          <Badge
                            variant="outline"
                            className={lineReadyForSubmission ? "text-emerald-700" : "text-amber-700"}
                          >
                            {lineReadyForSubmission ? "Ready" : "Pending Input"}
                          </Badge>
                        </div>
                      </div>

                      <div className="rounded-md border bg-muted/20 p-3 space-y-2">
                        <p className="text-sm font-medium">Map Line</p>
                        <div className="space-y-2">
                          <Label>Map Type</Label>
                          <Select
                            value={selectedMapType}
                            onValueChange={(value) => setMapType(lineId, value as "MOVEABLE" | "CONSUMABLE")}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="MOVEABLE">MOVEABLE</SelectItem>
                              <SelectItem value="CONSUMABLE">CONSUMABLE</SelectItem>
                            </SelectContent>
                          </Select>
                          <Label>
                            {selectedMapType === "MOVEABLE" ? "Search Asset" : "Search Consumable Item"}
                          </Label>
                          <Input
                            value={mapDraft.search}
                            onChange={(event) => setMapSearch(lineId, event.target.value)}
                            placeholder={
                              selectedMapType === "MOVEABLE"
                                ? "Type asset name"
                                : "Type consumable item name"
                            }
                          />
                          <Select
                            value={mapDraft.selectedId || undefined}
                            onValueChange={(value) => setMapSelection(lineId, value)}
                          >
                            <SelectTrigger>
                              <SelectValue
                                placeholder={
                                  selectedMapType === "MOVEABLE"
                                    ? "Select asset to map"
                                    : "Select consumable to map"
                                }
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {filteredMapOptions.map((item) => {
                                const optionId = String(item.id || "");
                                return (
                                  <SelectItem key={optionId} value={optionId}>
                                    {item.name}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full sm:w-auto"
                            onClick={() => {
                              if (!mapDraft.selectedId) {
                                toast.error("Select an item to map first.");
                                return;
                              }
                              mapLineMutation.mutate({
                                lineId,
                                mapType: selectedMapType,
                                mappedId: mapDraft.selectedId,
                              });
                            }}
                            disabled={
                              mapLineMutation.isPending ||
                              !mapDraft.selectedId
                            }
                          >
                            {mapLineMutation.isPending && (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            {selectedMapType === "MOVEABLE"
                              ? "Map to this Asset"
                              : "Map to this Consumable"}
                          </Button>
                        </div>
                        <div className="rounded border bg-background p-2 text-sm">
                          {isMapped ? (
                            <p className="text-emerald-700">
                              Mapped to: <span className="font-medium">{mappedName || mappedId}</span>
                            </p>
                          ) : (
                            <p className="text-amber-700">Map this line before fulfillment.</p>
                          )}
                        </div>
                      </div>

                      {line.line_type === "MOVEABLE" ? (
                        <div className="space-y-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full sm:w-auto"
                            onClick={() => openAssetPicker(line)}
                            disabled={!isMapped}
                          >
                            Select Asset Items ({draft.assignedAssetItemIds.length})
                          </Button>
                          {!isMapped && (
                            <p className="text-xs text-muted-foreground">
                              Map this line before fulfillment.
                            </p>
                          )}
                          {draft.assignedAssetItemIds.length > 0 && (
                            <div className="rounded border bg-muted/20 p-2">
                              <p className="text-xs font-medium text-muted-foreground">
                                Selected Asset Items ({draft.assignedAssetItemIds.length})
                              </p>
                              <ul className="mt-1 space-y-1 text-xs">
                                {draft.assignedAssetItemIds.slice(0, 3).map((assetItemId) => {
                                  const selectedItem = officeStockItemById.get(assetItemId);
                                  const selectedAssetName =
                                    assetById.get(String(selectedItem?.asset_id || ""))?.name ||
                                    selectedItem?.assets?.name ||
                                    "Unknown Asset";
                                  return (
                                    <li key={`${lineId}-${assetItemId}`} className="text-muted-foreground">
                                      {selectedAssetName} | Tag: {selectedItem?.tag || "N/A"} | Serial:{" "}
                                      {selectedItem?.serial_number || "N/A"}
                                    </li>
                                  );
                                })}
                                {draft.assignedAssetItemIds.length > 3 && (
                                  <li className="text-muted-foreground">
                                    +{draft.assignedAssetItemIds.length - 3} more selected
                                  </li>
                                )}
                              </ul>
                            </div>
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
                            disabled={!isMapped}
                          />
                          {!isMapped && (
                            <p className="text-xs text-muted-foreground">
                              Map this line before fulfillment.
                            </p>
                          )}
                        </div>
                      )}

                      {lineAssignments.length > 0 && (
                        <div className="rounded-md border p-3 space-y-3">
                          <p className="text-sm font-medium">Assignments</p>
                          {lineAssignments.map((assignment) => {
                            const assignmentId = asId(assignment);
                            const handoverFile = signedHandoverFiles[assignmentId] || null;
                            const returnFile = signedReturnFiles[assignmentId] || null;
                            const assignmentStatus = String(assignment.status || "");
                            return (
                              <div key={assignmentId} className="rounded border p-2 space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-xs font-mono">Assignment {assignmentId}</p>
                                  <StatusBadge status={assignmentStatus || "UNKNOWN"} />
                                </div>

                                {assignmentStatus === "DRAFT" && (
                                  <div className="space-y-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={async () => {
                                        try {
                                          const blob = await assignmentService.downloadHandoverSlipPdf(
                                            assignmentId
                                          );
                                          await downloadBlob(
                                            blob,
                                            `handover-slip-${assignmentId}.pdf`
                                          );
                                        } catch (error) {
                                          toast.error(
                                            error instanceof Error
                                              ? error.message
                                              : "Failed to open handover slip."
                                          );
                                        }
                                      }}
                                    >
                                      Open/Print Handover Slip
                                    </Button>

                                    {canManageAssignmentSlips && (
                                      <div className="space-y-2">
                                        <Input
                                          type="file"
                                          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                                          onChange={(event) =>
                                            setSignedHandoverFiles((previous) => ({
                                              ...previous,
                                              [assignmentId]: event.target.files?.[0] || null,
                                            }))
                                          }
                                        />
                                        <Button
                                          type="button"
                                          onClick={() => {
                                            if (!handoverFile) {
                                              toast.error(
                                                "Select a signed handover slip file first."
                                              );
                                              return;
                                            }
                                            uploadSignedHandoverMutation.mutate({
                                              assignmentId,
                                              file: handoverFile,
                                            });
                                          }}
                                          disabled={uploadSignedHandoverMutation.isPending}
                                        >
                                          {uploadSignedHandoverMutation.isPending && (
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                          )}
                                          Upload Signed Handover Slip
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {(assignmentStatus === "ISSUED" ||
                                  assignmentStatus === "RETURN_REQUESTED") && (
                                  <div className="space-y-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={async () => {
                                        try {
                                          const blob = await assignmentService.downloadHandoverSlipPdf(
                                            assignmentId
                                          );
                                          await downloadBlob(
                                            blob,
                                            `handover-slip-${assignmentId}.pdf`
                                          );
                                        } catch (error) {
                                          toast.error(
                                            error instanceof Error
                                              ? error.message
                                              : "Failed to open handover slip."
                                          );
                                        }
                                      }}
                                    >
                                      Open Handover Receipt
                                    </Button>

                                    {assignmentStatus === "ISSUED" && canRequestReturn && (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => requestReturnMutation.mutate(assignmentId)}
                                        disabled={requestReturnMutation.isPending}
                                      >
                                        {requestReturnMutation.isPending && (
                                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        )}
                                        Request Return
                                      </Button>
                                    )}

                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={async () => {
                                        try {
                                          const blob = await assignmentService.downloadReturnSlipPdf(
                                            assignmentId
                                          );
                                          await downloadBlob(blob, `return-slip-${assignmentId}.pdf`);
                                        } catch (error) {
                                          toast.error(
                                            error instanceof Error
                                              ? error.message
                                              : "Failed to open return slip."
                                          );
                                        }
                                      }}
                                    >
                                      Open/Print Return Slip
                                    </Button>

                                    {canManageAssignmentSlips && (
                                      <div className="space-y-2">
                                        <Input
                                          type="file"
                                          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                                          onChange={(event) =>
                                            setSignedReturnFiles((previous) => ({
                                              ...previous,
                                              [assignmentId]: event.target.files?.[0] || null,
                                            }))
                                          }
                                        />
                                        <Button
                                          type="button"
                                          onClick={() => {
                                            if (!returnFile) {
                                              toast.error("Select a signed return slip file first.");
                                              return;
                                            }
                                            uploadSignedReturnMutation.mutate({
                                              assignmentId,
                                              file: returnFile,
                                            });
                                          }}
                                          disabled={uploadSignedReturnMutation.isPending}
                                        >
                                          {uploadSignedReturnMutation.isPending && (
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                          )}
                                          Upload Signed Return Slip
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-md border bg-muted/20 p-3">
                  <p className="text-sm text-muted-foreground">
                    Submit once at least one mapped line has selected asset items or issued quantity.
                  </p>
                  <Button
                    type="button"
                    className="w-full sm:w-auto"
                    onClick={() => fulfillMutation.mutate()}
                    disabled={fulfillMutation.isPending || !fulfillmentSummary.canSubmit}
                  >
                    {fulfillMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Submit Fulfillment
                  </Button>
                </div>
              </div>
            )}

            {!canFulfill && requisitionAssignments.length > 0 && (
              <div className="rounded-md border p-4 space-y-3">
                <p className="font-medium">Assignments</p>
                {requisitionAssignments.map((assignment) => (
                  <div
                    key={asId(assignment)}
                    className="flex flex-col gap-2 rounded border p-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <p className="text-sm font-mono">{asId(assignment)}</p>
                    <StatusBadge status={String(assignment.status || "UNKNOWN")} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={Boolean(pickerLineId)}
        onOpenChange={(open) => (!open ? setPickerLineId(null) : null)}
      >
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select Asset Items</DialogTitle>
            <DialogDescription>
              Choose moveable asset items from issuing office stock for the mapped asset.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-md border bg-muted/20 p-2 text-sm">
              <span className="text-muted-foreground">Selected for this line</span>
              <span className="font-medium">
                {pickerLineId ? fulfillDraft[pickerLineId]?.assignedAssetItemIds.length || 0 : 0}
              </span>
            </div>
            <Input
              placeholder="Search by asset name, tag, serial number, or ID"
              value={pickerSearch}
              onChange={(event) => setPickerSearch(event.target.value)}
            />

            <div className="max-h-80 overflow-y-auto rounded-md border p-2 space-y-1">
              {pickerItems.length === 0 ? (
                <p className="p-2 text-sm text-muted-foreground">No mapped asset items found.</p>
              ) : (
                pickerItems.map((item: AssetItem) => {
                  const lineId = pickerLineId || "";
                  const line = lineById.get(lineId);
                  const selectedForLine =
                    fulfillDraft[lineId]?.assignedAssetItemIds.includes(item.id) || false;
                  const disabledByOtherLine =
                    !selectedForLine && selectedAssetsAcrossLines.has(item.id);
                  const assetName =
                    assetById.get(String(item.asset_id || ""))?.name ||
                    item.assets?.name ||
                    line?.requested_name ||
                    "Unknown Asset";
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
                        <p className="font-medium">{assetName}</p>
                        <p className="text-xs text-muted-foreground">
                          Tag: {item.tag || "N/A"} | Serial: {item.serial_number || "N/A"}
                        </p>
                        <p className="text-xs text-muted-foreground">Asset Item ID: {item.id}</p>
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            <div className="sticky bottom-0 flex justify-end border-t bg-background pt-3">
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
