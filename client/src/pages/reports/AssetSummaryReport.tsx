import { useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { DateRangeFilter } from "@/components/reports/DateRangeFilter";
import { Button } from "@/components/ui/button";
import { Download, FileDown } from "lucide-react";
import { toast } from "sonner";
import { useAssets } from "@/hooks/useAssets";
import { useAssetItems } from "@/hooks/useAssetItems";
import { useCategories } from "@/hooks/useCategories";
import {
  exportToCSV,
  filterRowsBySearch,
  formatCurrencyForExport,
  formatDateForExport,
} from "@/lib/exportUtils";
import { filterByDateRange, generateReportPDF, getDateRangeText } from "@/lib/reporting";
import { usePageSearch } from "@/contexts/PageSearchContext";

export default function AssetSummaryReport() {
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const pageSearch = usePageSearch();

  const { data: assets } = useAssets();
  const { data: assetItems } = useAssetItems();
  const { data: categories } = useCategories();

  const filteredAssets = useMemo(
    () => filterByDateRange(assets, "acquisition_date", startDate, endDate),
    [assets, startDate, endDate]
  );

  const reportRows = useMemo(() => {
    const items = assetItems || [];
    const categoryList = categories || [];

    return filteredAssets.map((asset) => {
      const category = categoryList.find((c) => c.id === asset.category_id);
      const itemCount = items.filter((i) => i.asset_id === asset.id).length;
      const quantity = asset.quantity || 0;
      const unitPrice = asset.unit_price || 0;

      return {
        id: asset.id,
        name: asset.name,
        category: category?.name || "Uncategorized",
        quantity,
        itemCount,
        unitPrice,
        totalValue: unitPrice * quantity,
        acquisitionDate: asset.acquisition_date,
        status: asset.is_active ? "Active" : "Inactive",
      };
    });
  }, [filteredAssets, assetItems, categories]);

  const searchTerm = pageSearch?.term || "";
  const filteredRows = useMemo(
    () => filterRowsBySearch(reportRows as any, searchTerm),
    [reportRows, searchTerm]
  );

  const dateRangeText = getDateRangeText(startDate, endDate);

  const columns = [
    { key: "name", label: "Asset Name" },
    { key: "category", label: "Category" },
    { key: "quantity", label: "Quantity" },
    { key: "itemCount", label: "Items Registered" },
    {
      key: "unitPrice",
      label: "Unit Price",
      render: (value: number) => formatCurrencyForExport(value),
    },
    {
      key: "totalValue",
      label: "Total Value",
      render: (value: number) => formatCurrencyForExport(value),
    },
    {
      key: "acquisitionDate",
      label: "Acquisition Date",
      render: (value: string) => formatDateForExport(value),
    },
    { key: "status", label: "Status" },
  ];

  const filename = `asset-summary-${new Date().toISOString().split("T")[0]}`;

  const handleExportCSV = () => {
    if (filteredRows.length === 0) {
      toast.error("No asset data available for the current filters");
      return;
    }

    exportToCSV(
      filteredRows as any,
      [
        { key: "name", header: "Asset Name" },
        { key: "category", header: "Category" },
        { key: "quantity", header: "Quantity" },
        { key: "itemCount", header: "Items Registered" },
        { key: "unitPrice", header: "Unit Price", formatter: (v) => formatCurrencyForExport(v as number) },
        { key: "totalValue", header: "Total Value", formatter: (v) => formatCurrencyForExport(v as number) },
        { key: "acquisitionDate", header: "Acquisition Date", formatter: (v) => formatDateForExport(v as string) },
        { key: "status", header: "Status" },
      ],
      filename
    );
  };

  const handleExportPDF = () => {
    if (filteredRows.length === 0) {
      toast.error("No asset data available for the current filters");
      return;
    }

    generateReportPDF({
      title: "Asset Summary Report",
      headers: ["Name", "Category", "Qty", "Items", "Unit Price", "Total Value", "Acq. Date", "Status"],
      data: filteredRows.map((row) => [
        row.name,
        row.category,
        row.quantity,
        row.itemCount,
        formatCurrencyForExport(row.unitPrice),
        formatCurrencyForExport(row.totalValue),
        formatDateForExport(row.acquisitionDate),
        row.status,
      ]),
      filename,
      dateRangeText,
    });
  };

  return (
    <MainLayout title="Asset Summary Report" description="Summarized asset counts and values">
      <PageHeader
        title="Asset Summary Report"
        description="Aggregated views of assets by category, quantity, and value"
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
