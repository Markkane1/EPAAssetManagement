import { useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { DateRangeFilter } from "@/components/reports/DateRangeFilter";
import { Button } from "@/components/ui/button";
import { Download, FileDown } from "lucide-react";
import { toast } from "sonner";
import { useAssets } from "@/hooks/useAssets";
import { useCategories } from "@/hooks/useCategories";
import {
  exportToCSV,
  filterRowsBySearch,
  formatCurrencyForExport,
} from "@/lib/exportUtils";
import { filterByDateRange, generateReportPDF, getDateRangeText } from "@/lib/reporting";
import { usePageSearch } from "@/contexts/PageSearchContext";

export default function FinancialSummaryReport() {
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const pageSearch = usePageSearch();

  const { data: assets } = useAssets();
  const { data: categories } = useCategories({ assetType: "ASSET" });

  const filteredAssets = useMemo(
    () => filterByDateRange(assets, "acquisition_date", startDate, endDate),
    [assets, startDate, endDate]
  );

  const reportRows = useMemo(() => {
    const categoryList = categories || [];
    const totals: Record<string, { count: number; value: number }> = {};

    filteredAssets.forEach((asset) => {
      const category = categoryList.find((c) => c.id === asset.category_id);
      const categoryName = category?.name || "Uncategorized";
      const count = asset.quantity || 0;
      const value = (asset.unit_price || 0) * count;

      if (!totals[categoryName]) {
        totals[categoryName] = { count: 0, value: 0 };
      }
      totals[categoryName].count += count;
      totals[categoryName].value += value;
    });

    const rows = Object.entries(totals).map(([category, data]) => ({
      id: `category-${category}`,
      category,
      assetCount: data.count,
      totalValue: data.value,
    }));

    const grandTotal = rows.reduce((sum, row) => sum + row.totalValue, 0);
    const totalCount = rows.reduce((sum, row) => sum + row.assetCount, 0);

    rows.push({
      id: "grand-total",
      category: "GRAND TOTAL",
      assetCount: totalCount,
      totalValue: grandTotal,
    });

    return rows;
  }, [filteredAssets, categories]);

  const searchTerm = pageSearch?.term || "";
  const filteredRows = useMemo(
    () => filterRowsBySearch(reportRows as any, searchTerm),
    [reportRows, searchTerm]
  );

  const dateRangeText = getDateRangeText(startDate, endDate);
  const filename = `financial-summary-${new Date().toISOString().split("T")[0]}`;

  const columns = [
    {
      key: "category",
      label: "Category",
      render: (value: string) => (
        <span className={value === "GRAND TOTAL" ? "font-semibold" : ""}>{value}</span>
      ),
    },
    {
      key: "assetCount",
      label: "Asset Count",
      render: (value: number, row: any) => (
        <span className={row.category === "GRAND TOTAL" ? "font-semibold" : ""}>{value}</span>
      ),
    },
    {
      key: "totalValue",
      label: "Total Value",
      render: (value: number, row: any) => (
        <span className={row.category === "GRAND TOTAL" ? "font-semibold" : ""}>
          {formatCurrencyForExport(value)}
        </span>
      ),
    },
  ];

  const handleExportCSV = () => {
    if (filteredRows.length === 0) {
      toast.error("No financial data available for the current filters");
      return;
    }

    exportToCSV(
      filteredRows as any,
      [
        { key: "category", header: "Category" },
        { key: "assetCount", header: "Asset Count" },
        { key: "totalValue", header: "Total Value", formatter: (v) => formatCurrencyForExport(v as number) },
      ],
      filename
    );
  };

  const handleExportPDF = () => {
    if (filteredRows.length === 0) {
      toast.error("No financial data available for the current filters");
      return;
    }

    generateReportPDF({
      title: "Financial Summary Report",
      headers: ["Category", "Asset Count", "Total Value"],
      data: filteredRows.map((row) => [
        row.category,
        row.assetCount,
        formatCurrencyForExport(row.totalValue),
      ]),
      filename,
      dateRangeText,
    });
  };

  return (
    <MainLayout title="Financial Summary" description="Asset value and acquisition costs">
      <PageHeader
        title="Financial Summary"
        description="Asset value totals by category"
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
