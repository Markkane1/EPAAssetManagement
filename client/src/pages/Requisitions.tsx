import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { requisitionService } from "@/services/requisitionService";
import { useLocations } from "@/hooks/useLocations";
import { useAuth } from "@/contexts/AuthContext";

function asId<T extends { id?: string; _id?: string }>(row: T): string {
  return String(row.id || row._id || "");
}

const STATUS_OPTIONS = [
  "ALL",
  "PENDING_VERIFICATION",
  "VERIFIED_APPROVED",
  "IN_FULFILLMENT",
  "PARTIALLY_FULFILLED",
  "FULFILLED_PENDING_SIGNATURE",
  "FULFILLED",
  "REJECTED_INVALID",
  "CANCELLED",
] as const;

export default function Requisitions() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const { data: locations } = useLocations();
  const canCreateRequisition =
    role === "employee" || role === "office_head" || role === "caretaker";

  const [status, setStatus] = useState<string>("ALL");
  const [fileNumber, setFileNumber] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({
    status: "ALL",
    fileNumber: "",
    fromDate: "",
    toDate: "",
  });

  const query = useQuery({
    queryKey: ["requisitions", appliedFilters.status, appliedFilters.fileNumber, appliedFilters.fromDate, appliedFilters.toDate],
    queryFn: () =>
      requisitionService.list({
        limit: 200,
        status: appliedFilters.status !== "ALL" ? appliedFilters.status : undefined,
        fileNumber: appliedFilters.fileNumber || undefined,
        from: appliedFilters.fromDate || undefined,
        to: appliedFilters.toDate || undefined,
      }),
  });

  const officeNameById = useMemo(() => {
    const map = new Map<string, string>();
    (locations || []).forEach((office) => {
      map.set(office.id, office.name);
    });
    return map;
  }, [locations]);

  const rows = useMemo(() => {
    const data = query.data?.data || [];
    return data
      .map((row) => {
        const id = asId(row);
        return {
          ...row,
          id,
          office_name: officeNameById.get(String(row.office_id || "")) || String(row.office_id || "N/A"),
          submitted_by: String(row.submitted_by_user_id || "N/A"),
        };
      })
      .filter((row) => row.id);
  }, [query.data?.data, officeNameById]);

  const columns = [
    { key: "file_number", label: "File Number", render: (value: unknown) => <span className="font-medium">{String(value || "N/A")}</span> },
    {
      key: "status",
      label: "Status",
      render: (value: unknown) => (
        <Badge variant="outline" className="font-mono text-xs">
          {String(value || "UNKNOWN")}
        </Badge>
      ),
    },
    {
      key: "created_at",
      label: "Created",
      render: (value: unknown) => {
        if (!value) return "N/A";
        return new Date(String(value)).toLocaleString();
      },
    },
    { key: "office_name", label: "Office" },
    { key: "submitted_by", label: "Submitted By" },
  ];

  if (query.isLoading) {
    return (
      <MainLayout title="Requisitions" description="Track requisition requests and status">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Requisitions" description="Track requisition requests and status">
      <PageHeader
        title="Requisitions"
        description="Filter and review requisition requests."
        action={
          canCreateRequisition
            ? { label: "New Requisition", onClick: () => navigate("/requisitions/new") }
            : undefined
        }
      />

      <Card className="mt-6">
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                {STATUS_OPTIONS.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>File Number</Label>
              <Input
                value={fileNumber}
                onChange={(event) => setFileNumber(event.target.value)}
                placeholder="Search file number"
              />
            </div>

            <div className="space-y-2">
              <Label>From Date</Label>
              <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>To Date</Label>
              <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <Button
              type="button"
              onClick={() =>
                setAppliedFilters({
                  status,
                  fileNumber: fileNumber.trim(),
                  fromDate,
                  toDate,
                })
              }
            >
              Apply Filters
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setStatus("ALL");
                setFileNumber("");
                setFromDate("");
                setToDate("");
                setAppliedFilters({
                  status: "ALL",
                  fileNumber: "",
                  fromDate: "",
                  toDate: "",
                });
              }}
            >
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6">
        <DataTable
          columns={columns}
          data={rows as Array<{ id: string }>}
          searchable={false}
          onRowClick={(row) => navigate(`/requisitions/${row.id}`)}
        />
      </div>
    </MainLayout>
  );
}
