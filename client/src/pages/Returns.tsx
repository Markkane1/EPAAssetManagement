import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { returnRequestService } from "@/services/returnRequestService";
import { useEmployees } from "@/hooks/useEmployees";
import { useLocations } from "@/hooks/useLocations";
import { ReturnRequestStatus } from "@/types";

const STATUS_OPTIONS = [
  "ALL",
  ReturnRequestStatus.Submitted,
  ReturnRequestStatus.ReceivedConfirmed,
  ReturnRequestStatus.ClosedPendingSignature,
  ReturnRequestStatus.Closed,
  ReturnRequestStatus.Rejected,
] as const;

const STATUS_RANK: Record<string, number> = {
  [ReturnRequestStatus.Submitted]: 0,
  [ReturnRequestStatus.ReceivedConfirmed]: 1,
  [ReturnRequestStatus.ClosedPendingSignature]: 2,
  [ReturnRequestStatus.Closed]: 3,
  [ReturnRequestStatus.Rejected]: 4,
};

function asId<T extends { id?: string; _id?: string }>(row: T): string {
  return String(row.id || row._id || "");
}

export default function Returns() {
  const navigate = useNavigate();
  const { data: employees } = useEmployees();
  const { data: locations } = useLocations();

  const [status, setStatus] = useState<string>("ALL");
  const [employeeId, setEmployeeId] = useState<string>("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({
    status: "ALL",
    employeeId: "ALL",
    fromDate: "",
    toDate: "",
  });

  const query = useQuery({
    queryKey: [
      "return-requests",
      appliedFilters.status,
      appliedFilters.employeeId,
      appliedFilters.fromDate,
      appliedFilters.toDate,
    ],
    queryFn: () =>
      returnRequestService.list({
        limit: 200,
        status: appliedFilters.status !== "ALL" ? appliedFilters.status : undefined,
        employeeId: appliedFilters.employeeId !== "ALL" ? appliedFilters.employeeId : undefined,
        from: appliedFilters.fromDate || undefined,
        to: appliedFilters.toDate || undefined,
      }),
  });

  const employeeNameById = useMemo(() => {
    const map = new Map<string, string>();
    (employees || []).forEach((employee) => {
      map.set(employee.id, `${employee.first_name} ${employee.last_name}`.trim() || employee.email);
    });
    return map;
  }, [employees]);

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
        const createdAt = new Date(String(row.created_at || 0)).getTime() || 0;
        return {
          ...row,
          id,
          _createdAt: createdAt,
          employee_name:
            employeeNameById.get(String(row.employee_id || "")) || String(row.employee_id || "N/A"),
          office_name:
            officeNameById.get(String(row.office_id || "")) || String(row.office_id || "N/A"),
          line_count: Array.isArray(row.lines) ? row.lines.length : 0,
        };
      })
      .filter((row) => row.id)
      .sort((a, b) => {
        const rankA = STATUS_RANK[String(a.status || "")] ?? 99;
        const rankB = STATUS_RANK[String(b.status || "")] ?? 99;
        if (rankA !== rankB) return rankA - rankB;
        return b._createdAt - a._createdAt;
      });
  }, [query.data?.data, employeeNameById, officeNameById]);

  const columns = [
    { key: "id", label: "Request ID", render: (value: unknown) => <span className="font-mono text-xs">{String(value || "N/A")}</span> },
    {
      key: "status",
      label: "Status",
      render: (value: unknown) => (
        <Badge variant="outline" className="font-mono text-xs">
          {String(value || "UNKNOWN")}
        </Badge>
      ),
    },
    { key: "employee_name", label: "Employee" },
    { key: "office_name", label: "Office" },
    { key: "line_count", label: "Lines" },
    {
      key: "created_at",
      label: "Created",
      render: (value: unknown) => (value ? new Date(String(value)).toLocaleString() : "N/A"),
    },
  ];

  if (query.isLoading) {
    return (
      <MainLayout title="Return Requests" description="Review return requests pending confirmation">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Return Requests" description="Review return requests pending confirmation">
      <PageHeader title="Return Requests" description="Filter and review employee return requests." />

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
              <Label>Employee</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={employeeId}
                onChange={(event) => setEmployeeId(event.target.value)}
              >
                <option value="ALL">ALL</option>
                {(employees || []).map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {`${employee.first_name} ${employee.last_name}`.trim() || employee.email}
                  </option>
                ))}
              </select>
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
                  employeeId,
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
                setEmployeeId("ALL");
                setFromDate("");
                setToDate("");
                setAppliedFilters({
                  status: "ALL",
                  employeeId: "ALL",
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
          onRowClick={(row) => navigate(`/returns/${row.id}`)}
        />
      </div>
    </MainLayout>
  );
}
