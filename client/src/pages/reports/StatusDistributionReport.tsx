import { useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { DateRangeFilter } from "@/components/reports/DateRangeFilter";
import { Button } from "@/components/ui/button";
import { Download, FileDown } from "lucide-react";
import { toast } from "sonner";
import { useAssetItems } from "@/hooks/useAssetItems";
import { exportToCSV, filterRowsBySearch } from "@/lib/exportUtils";
import { filterByDateRange, generateReportPDF, getDateRangeText } from "@/lib/reporting";
import { usePageSearch } from "@/contexts/PageSearchContext";

export default function StatusDistributionReport() {
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const pageSearch = usePageSearch();

  const { data: assetItems } = useAssetItems();

  const filteredItems = useMemo(
    () => filterByDateRange(assetItems, "created_at", startDate, endDate),
    [assetItems, startDate, endDate]
  );

  const reportRows = useMemo(() => {
    if (filteredItems.length === 0) return [];

    const statusCounts: Record<string, number> = {};
    const conditionCounts: Record<string, number> = {};
    const assignmentCounts: Record<string, number> = {};

    filteredItems.forEach((item) => {
      const status = item.item_status || "Unknown";
      const condition = item.item_condition || "Unknown";
      const assignment = item.assignment_status || "Unknown";

      statusCounts[status] = (statusCounts[status] || 0) + 1;
      conditionCounts[condition] = (conditionCounts[condition] || 0) + 1;
      assignmentCounts[assignment] = (assignmentCounts[assignment] || 0) + 1;
    });

    const total = filteredItems.length;
    const rows: Array<{ id: string; category: string; type: string; count: number; percentage: string }> = [];

    Object.entries(statusCounts).forEach(([type, count]) => {
      rows.push({
        id: `status-${type}`,
        category: "Status",
        type,
        count,
        percentage: ((count / total) * 100).toFixed(1) + "%",
      });
    });

    Object.entries(conditionCounts).forEach(([type, count]) => {
      rows.push({
        id: `condition-${type}`,
        category: "Condition",
        type,
        count,
        percentage: ((count / total) * 100).toFixed(1) + "%",
      });
    });

    Object.entries(assignmentCounts).forEach(([type, count]) => {
      rows.push({
        id: `assignment-${type}`,
        category: "Assignment",
        type,
        count,
        percentage: ((count / total) * 100).toFixed(1) + "%",
      });
    });

    return rows;
  }, [filteredItems]);

  const searchTerm = pageSearch?.term || "";
  const filteredRows = useMemo(
    () => filterRowsBySearch(reportRows as any, searchTerm),
    [reportRows, searchTerm]
  );

  const dateRangeText = getDateRangeText(startDate, endDate);
  const filename = `status-distribution-${new Date().toISOString().split("T")[0]}`;

  const columns = [
    { key: "category", label: "Category" },
    { key: "type", label: "Type" },
    { key: "count", label: "Count" },
    { key: "percentage", label: "Percentage" },
  ];

  const handleExportCSV = () => {
    if (filteredRows.length === 0) {
      toast.error("No asset item data available for the current filters");
      return;
    }

    exportToCSV(
      filteredRows as any,
      [
        { key: "category", header: "Category" },
        { key: "type", header: "Type" },
        { key: "count", header: "Count" },
        { key: "percentage", header: "Percentage" },
      ],
      filename
    );
  };

  const handleExportPDF = () => {
    if (filteredRows.length === 0) {
      toast.error("No asset item data available for the current filters");
      return;
    }

    generateReportPDF({
      title: "Status Distribution Report",
      headers: ["Category", "Type", "Count", "Percentage"],
      data: filteredRows.map((row) => [row.category, row.type, row.count, row.percentage]),
      filename,
      dateRangeText,
    });
  };

  return (
    <MainLayout title="Status Distribution" description="Distribution of item status and condition">
      <PageHeader
        title="Status Distribution"
        description="Status, condition, and assignment distribution across asset items"
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
