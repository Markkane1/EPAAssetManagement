import { useCallback, useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { DateRangeFilter } from "@/components/reports/DateRangeFilter";
import { Button } from "@/components/ui/button";
import { Download, FileDown } from "lucide-react";
import { toast } from "sonner";
import { useAssignments } from "@/hooks/useAssignments";
import { useEmployees } from "@/hooks/useEmployees";
import { useAssetItems } from "@/hooks/useAssetItems";
import { useAssets } from "@/hooks/useAssets";
import { useDirectorates } from "@/hooks/useDirectorates";
import { useLocations } from "@/hooks/useLocations";
import { isHeadOfficeLocation } from "@/lib/locationUtils";
import {
  exportToCSV,
  filterRowsBySearch,
  formatDateForExport,
} from "@/lib/exportUtils";
import { filterByDateRange, generateReportPDF, getDateRangeText } from "@/lib/reporting";
import { usePageSearch } from "@/contexts/PageSearchContext";
import { useAuth } from "@/contexts/AuthContext";

export default function AssignmentSummaryReport() {
  const { role, user } = useAuth();
  const isEmployeeRole = role === "employee";
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const pageSearch = usePageSearch();

  const { data: assignments } = useAssignments();
  const { data: employees } = useEmployees();
  const { data: assetItems } = useAssetItems();
  const { data: assets } = useAssets();
  const { data: directorates } = useDirectorates();
  const { data: locations } = useLocations();

  const filteredAssignments = useMemo(
    () => filterByDateRange(assignments, "assigned_date", startDate, endDate),
    [assignments, startDate, endDate]
  );
  const currentEmployee = useMemo(() => {
    const list = employees || [];
    const byUserId = list.find((employee) => employee.user_id === user?.id);
    const byEmail = list.find(
      (employee) => employee.email?.toLowerCase() === (user?.email || "").toLowerCase()
    );
    return byUserId || byEmail || null;
  }, [employees, user?.id, user?.email]);

  const getDirectorateName = useCallback((employeeId?: string) => {
    const employee = employees?.find((e) => e.id === employeeId);
    if (!employee) return "N/A";
    const location = locations?.find((l) => l.id === employee.location_id);
    if (!isHeadOfficeLocation(location)) return "N/A";
    const directorate = directorates?.find((d) => d.id === employee.directorate_id);
    return directorate?.name || "N/A";
  }, [employees, locations, directorates]);

  const reportRows = useMemo(() => {
    const employeeList = employees || [];
    const assetItemList = assetItems || [];
    const assetList = assets || [];
    const scopedAssignments = isEmployeeRole
      ? (filteredAssignments || []).filter((assignment) => assignment.employee_id === currentEmployee?.id)
      : filteredAssignments || [];

    return scopedAssignments.map((assignment) => {
      const employee = employeeList.find((e) => e.id === assignment.employee_id);
      const assetItem = assetItemList.find((i) => i.id === assignment.asset_item_id);
      const asset = assetItem ? assetList.find((a) => a.id === assetItem.asset_id) : undefined;

      return {
        id: assignment.id,
        employeeName: employee ? `${employee.first_name} ${employee.last_name}` : "Unknown",
        directorate: getDirectorateName(employee?.id),
        assetTag: assetItem?.tag || "N/A",
        assetName: asset?.name || "Unknown",
        assignedDate: assignment.assigned_date,
        expectedReturnDate: assignment.expected_return_date,
        returnedDate: assignment.returned_date,
        status: assignment.is_active ? "Active" : "Returned",
      };
    });
  }, [isEmployeeRole, filteredAssignments, currentEmployee?.id, employees, assetItems, assets, getDirectorateName]);

  const searchTerm = pageSearch?.term || "";
  const filteredRows = useMemo(
    () => filterRowsBySearch(reportRows, searchTerm),
    [reportRows, searchTerm]
  );

  const dateRangeText = getDateRangeText(startDate, endDate);
  const filename = `assignment-summary-${new Date().toISOString().split("T")[0]}`;

  const columns = [
    { key: "employeeName", label: "Employee" },
    { key: "directorate", label: "Directorate" },
    { key: "assetTag", label: "Asset Tag" },
    { key: "assetName", label: "Asset Name" },
    {
      key: "assignedDate",
      label: "Assigned",
      render: (value: string) => formatDateForExport(value),
    },
    {
      key: "expectedReturnDate",
      label: "Expected Return",
      render: (value: string) => formatDateForExport(value),
    },
    {
      key: "returnedDate",
      label: "Returned",
      render: (value: string) => formatDateForExport(value),
    },
    { key: "status", label: "Status" },
  ];

  const handleExportCSV = () => {
    if (filteredRows.length === 0) {
      toast.error("No assignment data available for the current filters");
      return;
    }

    exportToCSV(
      filteredRows as any,
      [
        { key: "employeeName", header: "Employee Name" },
        { key: "directorate", header: "Directorate" },
        { key: "assetTag", header: "Asset Tag" },
        { key: "assetName", header: "Asset Name" },
        { key: "assignedDate", header: "Assigned Date", formatter: (v) => formatDateForExport(v as string) },
        { key: "expectedReturnDate", header: "Expected Return", formatter: (v) => formatDateForExport(v as string) },
        { key: "returnedDate", header: "Returned Date", formatter: (v) => formatDateForExport(v as string) },
        { key: "status", header: "Status" },
      ],
      filename
    );
  };

  const handleExportPDF = () => {
    if (filteredRows.length === 0) {
      toast.error("No assignment data available for the current filters");
      return;
    }

    generateReportPDF({
      title: "Assignment Summary Report",
      headers: ["Employee", "Directorate", "Asset Tag", "Asset", "Assigned", "Expected Return", "Status"],
      data: filteredRows.map((row) => [
        row.employeeName,
        row.directorate,
        row.assetTag,
        row.assetName,
        formatDateForExport(row.assignedDate),
        formatDateForExport(row.expectedReturnDate),
        row.status,
      ]),
      filename,
      dateRangeText,
    });
  };

  return (
    <MainLayout title="Assignment Summary" description="Assignments by employee and directorate">
      <PageHeader
        title="Assignment Summary"
        description={
          isEmployeeRole
            ? "Your complete assignment history, including returned assets"
            : "Assignments by employee, directorate, and asset item"
        }
        extra={
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={handleExportCSV}>
              <Download className="h-4 w-4" />
              CSV
            </Button>
            <Button className="gap-2" onClick={handleExportPDF}>
              <FileDown className="h-4 w-4" />
              PDF
            </Button>
          </div>
        }
      />

      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onClear={() => {
          setStartDate(undefined);
          setEndDate(undefined);
        }}
        rangeText={dateRangeText}
      />

      <DataTable columns={columns} data={reportRows as any} searchable />
    </MainLayout>
  );
}
