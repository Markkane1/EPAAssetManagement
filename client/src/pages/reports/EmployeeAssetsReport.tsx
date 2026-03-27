import { useMemo, useState } from "react";
import { ReportTablePage } from "@/components/reports/ReportTablePage";
import { toast } from "sonner";
import { useEmployees } from "@/hooks/useEmployees";
import { useAssignments } from "@/hooks/useAssignments";
import { useAssetItems } from "@/hooks/useAssetItems";
import { useDirectorates } from "@/hooks/useDirectorates";
import { useLocations } from "@/hooks/useLocations";
import {
  exportToCSV,
  filterRowsBySearch,
} from "@/lib/exportUtils";
import { filterByDateRange, generateReportPDF, getDateRangeText } from "@/lib/reporting";
import { usePageSearch } from "@/contexts/PageSearchContext";
import { useAuth } from "@/contexts/AuthContext";
import { buildDirectorateNameResolver, buildIdMap, findCurrentEmployee } from "@/pages/reports/reportResolvers";

export default function EmployeeAssetsReport() {
  const { role, user } = useAuth();
  const isEmployeeRole = role === "employee";
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
  const currentEmployee = useMemo(() => {
    return findCurrentEmployee(employees || [], user?.id, user?.email);
  }, [employees, user?.id, user?.email]);

  const assetItemById = useMemo(() => buildIdMap(assetItems || []), [assetItems]);
  const reportLocations = useMemo(
    () => [...(locations || []), ...(directorates || [])],
    [locations, directorates]
  );
  const getDirectorateName = useMemo(
    () => buildDirectorateNameResolver(reportLocations, employees || []),
    [reportLocations, employees]
  );

  const reportRows = useMemo(() => {
    const employeeList = isEmployeeRole ? (currentEmployee ? [currentEmployee] : []) : employees || [];
    const assignmentList = filteredAssignments || [];

    return employeeList.map((employee) => {
      const employeeAssignments = assignmentList.filter(
        (assignment) => assignment.employee_id === employee.id && assignment.is_active
      );
      const assetTags = employeeAssignments
        .map((assignment) => {
          const item = assignment.asset_item_id ? assetItemById.get(assignment.asset_item_id) : undefined;
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
  }, [isEmployeeRole, currentEmployee, employees, filteredAssignments, assetItemById, getDirectorateName]);

  const searchTerm = pageSearch?.term || "";
  const filteredRows = useMemo(
    () => filterRowsBySearch(reportRows, searchTerm),
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

  const handleExportPDF = async () => {
    if (filteredRows.length === 0) {
      toast.error("No employee asset data available for the current filters");
      return;
    }

    await generateReportPDF({
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
    <ReportTablePage
      title="Employee Assets Report"
      description={isEmployeeRole ? "Assets currently assigned to you" : "Assets assigned to each employee"}
      layoutDescription="Assets assigned to employees"
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
