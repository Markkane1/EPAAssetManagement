import { useMemo, useState } from "react";
import { ReportTablePage } from "@/components/reports/ReportTablePage";
import { toast } from "sonner";
import { useAssignments } from "@/hooks/useAssignments";
import { useEmployees } from "@/hooks/useEmployees";
import { useAssetItems } from "@/hooks/useAssetItems";
import { useAssets } from "@/hooks/useAssets";
import { useDirectorates } from "@/hooks/useDirectorates";
import { useLocations } from "@/hooks/useLocations";
import {
  exportToCSV,
  filterRowsBySearch,
  formatDateForExport,
} from "@/lib/exportUtils";
import { filterByDateRange, generateReportPDF, getDateRangeText } from "@/lib/reporting";
import { usePageSearch } from "@/contexts/PageSearchContext";
import { useAuth } from "@/contexts/AuthContext";
import { buildDirectorateNameResolver, buildIdMap, findCurrentEmployee } from "@/pages/reports/reportResolvers";

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
    return findCurrentEmployee(employees || [], user?.id, user?.email);
  }, [employees, user?.id, user?.email]);

  const employeeById = useMemo(() => buildIdMap(employees || []), [employees]);
  const assetItemById = useMemo(() => buildIdMap(assetItems || []), [assetItems]);
  const assetById = useMemo(() => buildIdMap(assets || []), [assets]);
  const reportLocations = useMemo(
    () => [...(locations || []), ...(directorates || [])],
    [locations, directorates]
  );
  const getDirectorateName = useMemo(
    () => buildDirectorateNameResolver(reportLocations, employees || []),
    [reportLocations, employees]
  );

  const reportRows = useMemo(() => {
    const scopedAssignments = isEmployeeRole
      ? (filteredAssignments || []).filter((assignment) => assignment.employee_id === currentEmployee?.id)
      : filteredAssignments || [];

    return scopedAssignments.map((assignment) => {
      const employee = assignment.employee_id ? employeeById.get(assignment.employee_id) : undefined;
      const assetItem = assignment.asset_item_id ? assetItemById.get(assignment.asset_item_id) : undefined;
      const asset = assetItem ? assetById.get(assetItem.asset_id) : undefined;

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
  }, [isEmployeeRole, filteredAssignments, currentEmployee?.id, employeeById, assetItemById, assetById, getDirectorateName]);

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

  const handleExportPDF = async () => {
    if (filteredRows.length === 0) {
      toast.error("No assignment data available for the current filters");
      return;
    }

    await generateReportPDF({
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
    <ReportTablePage
      title="Assignment Summary"
      description={
        isEmployeeRole
          ? "Your complete assignment history, including returned assets"
          : "Assignments by employee, directorate, and asset item"
      }
      layoutDescription="Assignments by employee and directorate"
      columns={columns}
      data={reportRows}
      startDate={startDate}
      endDate={endDate}
      onStartDateChange={setStartDate}
      onEndDateChange={setEndDate}
      onClearDateRange={() => {
        setStartDate(undefined);
        setEndDate(undefined);
      }}
      dateRangeText={dateRangeText}
      onExportCSV={handleExportCSV}
      onExportPDF={handleExportPDF}
    />
  );
}
