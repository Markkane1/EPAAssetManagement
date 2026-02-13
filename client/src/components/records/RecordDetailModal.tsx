import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, AlertTriangle } from "lucide-react";
import { useRecordDetail, useRecordLookup } from "@/hooks/useRecords";
import type { RecordDetailResponse } from "@/types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";
const FILE_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, "");

function buildFileUrl(fileUrl?: string | null) {
  if (!fileUrl) return null;
  if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) return fileUrl;
  return `${FILE_BASE_URL}${fileUrl}`;
}

function formatDate(value?: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "N/A" : date.toLocaleString();
}

export interface RecordDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordId?: string | null;
  lookup?: {
    recordType?: string;
    assetItemId?: string;
    employeeId?: string;
    assignmentId?: string;
    transferId?: string;
    maintenanceRecordId?: string;
    referenceNo?: string;
  };
  title?: string;
}

export function RecordDetailModal({
  open,
  onOpenChange,
  recordId,
  lookup,
  title = "Digital File",
}: RecordDetailModalProps) {
  const lookupEnabled = open && !recordId && Boolean(lookup);
  const lookupQuery = useRecordLookup(lookup || null, lookupEnabled);
  const resolvedRecordId = recordId || lookupQuery.data?.id || null;

  const detailEnabled = open && Boolean(resolvedRecordId);
  const detailQuery = useRecordDetail(resolvedRecordId, detailEnabled);

  const detail = detailQuery.data as RecordDetailResponse | undefined;
  const missing = detail?.missingRequirements || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[920px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] pr-4">
          {(lookupQuery.isLoading || detailQuery.isLoading) && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading record file...
            </div>
          )}

          {!detailQuery.isLoading && !detail && lookupQuery.isFetched && (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No linked record found yet.
            </div>
          )}

          {detail && (
            <div className="space-y-6">
              <section className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Reference</p>
                    <p className="text-lg font-semibold">{detail.record.reference_no}</p>
                    <p className="text-sm text-muted-foreground">
                      {detail.record.record_type} • Created {formatDate(detail.record.created_at)}
                    </p>
                  </div>
                  <Badge variant="secondary">{detail.record.status}</Badge>
                </div>
                {detail.record.notes && (
                  <p className="mt-3 text-sm text-muted-foreground">{detail.record.notes}</p>
                )}
              </section>

              <section className="rounded-lg border p-4">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  Missing Requirements
                </div>
                <Separator className="my-3" />
                {missing.length === 0 ? (
                  <p className="text-sm text-muted-foreground">All requirements satisfied.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {missing.map((item) => (
                      <li key={item} className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-destructive" />
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-lg border p-4">
                <div className="flex items-center gap-2 font-semibold">
                  <FileText className="h-4 w-4" />
                  Documents
                </div>
                <Separator className="my-3" />
                {detail.documents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No documents linked yet.</p>
                ) : (
                  <div className="space-y-4">
                    {detail.documents.map((docView, index) => {
                      const doc = docView.document;
                      const docKey = doc?.id || docView.links[0]?.id || String(index);
                      return (
                        <div key={docKey} className="rounded-md border p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold">{doc?.title || "Untitled Document"}</p>
                              <p className="text-xs text-muted-foreground">
                                {doc?.doc_type || "Unknown"} • {doc?.status || "Draft"}
                              </p>
                            </div>
                            <Badge variant="outline">{docView.versions.length} version(s)</Badge>
                          </div>
                          {docView.versions.length > 0 && (
                            <div className="mt-3 space-y-2 text-sm">
                              {docView.versions.map((version) => {
                                const fileUrl = buildFileUrl(
                                  version.file_url || `/api/documents/versions/${version.id}/download`
                                );
                                return (
                                  <div key={version.id} className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                      <p className="font-medium">
                                        v{version.version_no} • {version.file_name}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {Math.round(version.size_bytes / 1024)} KB • Uploaded{" "}
                                        {formatDate(version.uploaded_at)}
                                      </p>
                                    </div>
                                    {fileUrl && (
                                      <a
                                        href={fileUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-sm font-medium text-primary hover:underline"
                                      >
                                        View file
                                      </a>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="rounded-lg border p-4">
                <div className="text-sm font-semibold">Approval Requests</div>
                <Separator className="my-3" />
                {detail.approvals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No approval requests recorded.</p>
                ) : (
                  <div className="space-y-2 text-sm">
                    {detail.approvals.map((approval) => (
                      <div key={approval.id} className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium">{approval.status}</p>
                          <p className="text-xs text-muted-foreground">
                            {approval.approver_role
                              ? `Role: ${approval.approver_role}`
                              : approval.approver_user_id
                                ? `User: ${approval.approver_user_id}`
                                : "Approver pending"}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          Requested {formatDate(approval.requested_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-lg border p-4">
                <div className="text-sm font-semibold">Audit Trail</div>
                <Separator className="my-3" />
                {detail.auditLogs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No audit activity yet.</p>
                ) : (
                  <div className="space-y-2 text-sm">
                    {detail.auditLogs.map((log) => (
                      <div key={log.id} className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium">{log.action}</p>
                          <p className="text-xs text-muted-foreground">
                            {log.entity_type} • {log.entity_id}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground">{formatDate(log.timestamp)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
