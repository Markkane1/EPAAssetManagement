import { useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { DateRangeFilter } from "@/components/reports/DateRangeFilter";
import { Button } from "@/components/ui/button";
import { Download, FileDown } from "lucide-react";
import { toast } from "sonner";
import { useEmployees } from "@/hooks/useEmployees";
import { useAssignments } from "@/hooks/useAssignments";
import { useAssetItems } from "@/hooks/useAssetItems";
import { useDirectorates } from "@/hooks/useDirectorates";
import { useLocations } from "@/hooks/useLocations";
import { isHeadOfficeLocation } from "@/lib/locationUtils";
import {
  exportToCSV,
  filterRowsBySearch,
} from "@/lib/exportUtils";
import { filterByDateRange, generateReportPDF, getDateRangeText } from "@/lib/reporting";
import { usePageSearch } from "@/contexts/PageSearchContext";

export default function EmployeeAssetsReport() {
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const pageSearch = usePageSearch();

  const { data: employees } = useEmployees();
  const { data: assignments } = useAssignments();
  const { data: assetItems } = useAssetItems();
  const { data: directorates } = useDirectorates();
  const { data: locations } = useLocations();

  const filteredAssignments = useMemo(
    () => filterByDateRange(assignments, "assigned_date", startDate, endDate),
    [assignments, startDate, endDate]
  );

  const getDirectorateName = (employeeId?: string) => {
    const employee = employees?.find((e) => e.id === employeeId);
    if (!employee) return "N/A";
    const location = locations?.find((l) => l.id === employee.location_id);
    if (!isHeadOfficeLocation(location)) return "N/A";
    const directorate = directorates?.find((d) => d.id === employee.directorate_id);
    return directorate?.name || "N/A";
  };

  const reportRows = useMemo(() => {
    const employeeList = employees || [];
    const assignmentList = filteredAssignments || [];
    const itemList = assetItems || [];

    return employeeList.map((employee) => {
      const employeeAssignments = assignmentList.filter(
        (assignment) => assignment.employee_id === employee.id && assignment.is_active
      );
      const assetTags = employeeAssignments
        .map((assignment) => {
          const item = itemList.find((i) => i.id === assignment.asset_item_id);
          return item?.tag || "N/A";
        })
        .join("; ");

      return {
        id: employee.id,
        employeeName: `${employee.first_name} ${employee.last_name}`,
        email: employee.email,
        directorate: getDirectorateName(employee.id),
        jobTitle: employee.job_title || "",
        activeAssignments: employeeAssignments.length,
        assetTags: assetTags || "None",
      };
    });
  }, [employees, filteredAssignments, assetItems, directorates, locations]);

  const searchTerm = pageSearch?.term || "";
  const filteredRows = useMemo(
    () => filterRowsBySearch(reportRows as any, searchTerm),
    [reportRows, searchTerm]
  );

  const dateRangeText = getDateRangeText(startDate, endDate);
  const filename = `employee-assets-${new Date().toISOString().split("T")[0]}`;

  const columns = [
    { key: "employeeName", label: "Employee" },
    { key: "email", label: "Email" },
    { key: "directorate", label: "Directorate" },
    { key: "jobTitle", label: "Job Title" },
    { key: "activeAssignments", label: "Assignments" },
    { key: "assetTags", label: "Assigned Asset Tags" },
  ];

  const handleExportCSV = () => {
    if (filteredRows.length === 0) {
      toast.error("No employee asset data available for the current filters");
      return;
    }

    exportToCSV(
      filteredRows as any,
      [
        { key: "employeeName", header: "Employee Name" },
        { key: "email", header: "Email" },
        { key: "directorate", header: "Directorate" },
        { key: "jobTitle", header: "Job Title" },
        { key: "activeAssignments", header: "Active Assignments" },
        { key: "assetTags", header: "Assigned Asset Tags" },
      ],
      filename
    );
  };

  const handleExportPDF = () => {
    if (filteredRows.length === 0) {
      toast.error("No employee asset data available for the current filters");
      return;
    }

    generateReportPDF({
      title: "Employee Assets Report",
      headers: ["Employee", "Email", "Directorate", "Job Title", "Assignments", "Asset Tags"],
      data: filteredRows.map((row) => [
        row.employeeName,
        row.email,
        row.directorate,
        row.jobTitle,
        row.activeAssignments,
        row.assetTags,
      ]),
      filename,
      dateRangeText,
    });
  };

  return (
    <MainLayout title="Employee Assets Report" description="Assets assigned to employees">
      <PageHeader
        title="Employee Assets Report"
        description="Assets assigned to each employee"
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
