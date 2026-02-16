import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";
import { reportService } from "@/services/reportService";
import { useLocations } from "@/hooks/useLocations";
import { useAuth } from "@/contexts/AuthContext";
import { isHeadOfficeLocation } from "@/lib/locationUtils";

type ComplianceIssue = {
  type: "REQUISITION" | "RETURN_REQUEST";
  issue: "MISSING_SIGNED_ISSUE_SLIP" | "MISSING_SIGNED_RETURN_SLIP";
  id: string;
  office_id: string;
  status: string;
  file_number?: string;
  signed_document_id: string | null;
  created_at: string;
  updated_at: string;
};

export default function Compliance() {
  const navigate = useNavigate();
  const { isOrgAdmin, locationId } = useAuth();
  const { data: locations } = useLocations();
  const locationList = locations || [];

  const currentLocation = locationId
    ? locationList.find((location) => location.id === locationId) || null
    : null;
  const isHqView = isOrgAdmin || isHeadOfficeLocation(currentLocation);

  const [selectedOfficeId, setSelectedOfficeId] = useState("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({
    selectedOfficeId: "ALL",
    fromDate: "",
    toDate: "",
  });

  const query = useQuery({
    queryKey: [
      "compliance",
      appliedFilters.selectedOfficeId,
      appliedFilters.fromDate,
      appliedFilters.toDate,
      isHqView ? "hq" : "office",
      locationId || "",
    ],
    queryFn: () =>
      reportService.getNonCompliance({
        officeId: isHqView
          ? appliedFilters.selectedOfficeId !== "ALL"
            ? appliedFilters.selectedOfficeId
            : undefined
          : locationId || undefined,
        from: appliedFilters.fromDate || undefined,
        to: appliedFilters.toDate || undefined,
        page: 1,
        limit: 1000,
      }),
  });

  const officeNameById = useMemo(() => {
    const map = new Map<string, string>();
    locationList.forEach((office) => map.set(office.id, office.name));
    return map;
  }, [locationList]);

  const requisitionRows = useMemo(
    () =>
      (query.data?.items || [])
        .filter((item): item is ComplianceIssue => item.type === "REQUISITION")
        .sort(
          (a, b) =>
            new Date(String(b.created_at || 0)).getTime() -
            new Date(String(a.created_at || 0)).getTime()
        ),
    [query.data?.items]
  );

  const returnRows = useMemo(
    () =>
      (query.data?.items || [])
        .filter((item): item is ComplianceIssue => item.type === "RETURN_REQUEST")
        .sort(
          (a, b) =>
            new Date(String(b.created_at || 0)).getTime() -
            new Date(String(a.created_at || 0)).getTime()
        ),
    [query.data?.items]
  );

  if (query.isLoading) {
    return (
      <MainLayout title="Compliance" description="Track missing signed issuance and return slips">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  if (query.isError) {
    return (
      <MainLayout title="Compliance" description="Track missing signed issuance and return slips">
        <Alert variant="destructive" className="mt-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load compliance report</AlertTitle>
          <AlertDescription>
            {query.error instanceof Error ? query.error.message : "Unknown error"}
          </AlertDescription>
        </Alert>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Compliance" description="Track missing signed issuance and return slips">
      <PageHeader
        title="Compliance Dashboard"
        description="Identify fulfilled transactions missing final signed documentation."
      />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            {isHqView && (
              <div className="space-y-2">
                <Label>Office</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={selectedOfficeId}
                  onChange={(event) => setSelectedOfficeId(event.target.value)}
                >
                  <option value="ALL">All Offices</option>
                  {locationList.map((office) => (
                    <option key={office.id} value={office.id}>
                      {office.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <Label>From Date</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>To Date</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() =>
                setAppliedFilters({
                  selectedOfficeId,
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
                setSelectedOfficeId("ALL");
                setFromDate("");
                setToDate("");
                setAppliedFilters({
                  selectedOfficeId: "ALL",
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

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              Requisitions Missing Signed IssueSlip
            </CardTitle>
            <Badge variant="destructive">
              {query.data?.counts?.requisitionsWithoutSignedIssueSlip || 0}
            </Badge>
          </CardHeader>
          <CardContent>
            {requisitionRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No noncompliant requisitions found.</p>
            ) : (
              <div className="space-y-2">
                {requisitionRows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className="w-full rounded border p-3 text-left hover:bg-muted/40"
                    onClick={() => navigate(`/requisitions/${row.id}`)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{row.file_number || row.id}</p>
                        <p className="text-xs text-muted-foreground">
                          Office: {officeNameById.get(String(row.office_id || "")) || row.office_id}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Created: {new Date(row.created_at).toLocaleString()}
                        </p>
                      </div>
                      <Badge variant="outline" className="font-mono text-xs">
                        {row.status}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              Return Requests Missing Signed ReturnSlip
            </CardTitle>
            <Badge variant="destructive">
              {query.data?.counts?.returnRequestsWithoutSignedReturnSlip || 0}
            </Badge>
          </CardHeader>
          <CardContent>
            {returnRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No noncompliant return requests found.</p>
            ) : (
              <div className="space-y-2">
                {returnRows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className="w-full rounded border p-3 text-left hover:bg-muted/40"
                    onClick={() => navigate(`/returns/${row.id}`)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{row.id}</p>
                        <p className="text-xs text-muted-foreground">
                          Office: {officeNameById.get(String(row.office_id || "")) || row.office_id}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Created: {new Date(row.created_at).toLocaleString()}
                        </p>
                      </div>
                      <Badge variant="outline" className="font-mono text-xs">
                        {row.status}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Signed document upload paths: Requisition detail (`/requisitions/:id`) and Return detail (`/returns/:id`).
      </p>
    </MainLayout>
  );
}
