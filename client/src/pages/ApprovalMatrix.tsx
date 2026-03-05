import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useDecideApprovalMatrixRequest,
  usePendingApprovalMatrixRequests,
} from "@/hooks/useApprovalMatrix";
import type {
  ApprovalMatrixDecision,
  ApprovalMatrixRequest,
} from "@/services/approvalMatrixService";

type ApprovalRow = ApprovalMatrixRequest & {
  transactionLabel: string;
  approvalProgress: string;
};

function formatToken(value: string) {
  const normalized = String(value || "").trim();
  if (!normalized) return "-";
  return normalized
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function formatAmount(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(numeric);
}

export default function ApprovalMatrix() {
  const pendingQuery = usePendingApprovalMatrixRequests();
  const decideMutation = useDecideApprovalMatrixRequest();
  const [notes, setNotes] = useState("");
  const [selectedDecision, setSelectedDecision] = useState<{
    id: string;
    decision: ApprovalMatrixDecision;
    transactionLabel: string;
  } | null>(null);

  const pendingRows: ApprovalRow[] = useMemo(() => {
    const rows = Array.isArray(pendingQuery.data) ? pendingQuery.data : [];
    return rows.map((row) => {
      const approvals = Array.isArray(row.approvals) ? row.approvals : [];
      const approvedCount = approvals.filter(
        (entry) => String(entry?.decision || "") === "Approved"
      ).length;
      const requiredApprovals = Math.max(1, Number(row.required_approvals || 1));
      return {
        ...row,
        transactionLabel: formatToken(row.transaction_type),
        approvalProgress: `${approvedCount}/${requiredApprovals}`,
      };
    });
  }, [pendingQuery.data]);

  const openDecisionDialog = (row: ApprovalRow, decision: ApprovalMatrixDecision) => {
    setSelectedDecision({
      id: row.id,
      decision,
      transactionLabel: row.transactionLabel,
    });
    setNotes("");
  };

  const closeDialog = () => {
    if (decideMutation.isPending) return;
    setSelectedDecision(null);
    setNotes("");
  };

  const submitDecision = async () => {
    if (!selectedDecision) return;
    try {
      await decideMutation.mutateAsync({
        id: selectedDecision.id,
        decision: selectedDecision.decision,
        notes: notes.trim() || undefined,
      });
      closeDialog();
    } catch {
      // Error feedback is handled in the mutation callback.
    }
  };

  if (pendingQuery.isLoading) {
    return (
      <MainLayout title="Approvals Queue" description="Review pending approval matrix requests">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  if (pendingQuery.isError) {
    return (
      <MainLayout title="Approvals Queue" description="Review pending approval matrix requests">
        <Card>
          <CardHeader>
            <CardTitle>Unable to load pending approvals</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => pendingQuery.refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </MainLayout>
    );
  }

  const columns = [
    { key: "transactionLabel", label: "Transaction" },
    {
      key: "risk_tags",
      label: "Risk Tags",
      render: (value: unknown) => {
        const tags = Array.isArray(value) ? value : [];
        if (tags.length === 0) return <span className="text-muted-foreground">-</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => (
              <Badge key={String(tag)} variant="secondary">
                {String(tag)}
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      key: "amount",
      label: "Amount",
      render: (value: unknown) => formatAmount(value),
    },
    { key: "approvalProgress", label: "Approvals" },
    {
      key: "requested_at",
      label: "Requested At",
      render: (value: unknown) => formatDateTime(String(value || "")),
    },
    {
      key: "maker_user_id",
      label: "Maker",
      render: (value: unknown) => (
        <span className="font-mono text-xs">{String(value || "-")}</span>
      ),
    },
    {
      key: "office_id",
      label: "Office",
      render: (value: unknown) => (
        <span className="font-mono text-xs">{String(value || "-")}</span>
      ),
    },
  ];

  const actions = (row: ApprovalRow) => (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        onClick={() => openDecisionDialog(row, "APPROVED")}
        disabled={decideMutation.isPending}
      >
        Approve
      </Button>
      <Button
        size="sm"
        variant="destructive"
        onClick={() => openDecisionDialog(row, "REJECTED")}
        disabled={decideMutation.isPending}
      >
        Reject
      </Button>
    </div>
  );

  const pendingCount = pendingRows.length;

  return (
    <MainLayout title="Approvals Queue" description="Review pending approval matrix requests">
      <PageHeader
        title="Approvals Queue"
        description="Approve or reject pending maker-checker requests for transfer and consumable workflows."
      />

      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">
              You can decide only the requests currently assigned to your role/scope.
            </p>
            <Badge variant={pendingCount > 0 ? "default" : "secondary"}>
              {pendingCount} Pending
            </Badge>
          </div>
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={pendingRows}
        actions={actions}
        searchPlaceholder="Search pending approvals..."
      />

      <Dialog open={Boolean(selectedDecision)} onOpenChange={(open) => (!open ? closeDialog() : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedDecision?.decision === "APPROVED" ? "Approve Request" : "Reject Request"}
            </DialogTitle>
            <DialogDescription>
              {selectedDecision
                ? `${selectedDecision.transactionLabel} workflow (${selectedDecision.id}).`
                : "Confirm decision."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="approval-notes">Notes (optional)</Label>
            <Textarea
              id="approval-notes"
              placeholder="Enter review notes for the maker..."
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={decideMutation.isPending}>
              Cancel
            </Button>
            <Button
              variant={selectedDecision?.decision === "REJECTED" ? "destructive" : "default"}
              onClick={() => void submitDecision()}
              disabled={decideMutation.isPending}
            >
              {decideMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {selectedDecision?.decision === "APPROVED" ? "Confirm Approve" : "Confirm Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
