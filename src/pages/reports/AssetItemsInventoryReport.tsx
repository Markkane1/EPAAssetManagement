import { useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { DateRangeFilter } from "@/components/reports/DateRangeFilter";
import { Button } from "@/components/ui/button";
import { Download, FileDown } from "lucide-react";
import { toast } from "sonner";
import { useAssetItems } from "@/hooks/useAssetItems";
import { useAssets } from "@/hooks/useAssets";
import { useLocations } from "@/hooks/useLocations";
import {
  exportToCSV,
  filterRowsBySearch,
  formatDateForExport,
} from "@/lib/exportUtils";
import { filterByDateRange, generateReportPDF, getDateRangeText } from "@/lib/reporting";
import { usePageSearch } from "@/contexts/PageSearchContext";

export default function AssetItemsInventoryReport() {
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const pageSearch = usePageSearch();

  const { data: assetItems } = useAssetItems();
  const { data: assets } = useAssets();
  const { data: locations } = useLocations();

  const filteredItems = useMemo(
    () => filterByDateRange(assetItems, "created_at", startDate, endDate),
    [assetItems, startDate, endDate]
  );

  const reportRows = useMemo(() => {
    const assetList = assets || [];
    const locationList = locations || [];

    return filteredItems.map((item) => {
      const asset = assetList.find((a) => a.id === item.asset_id);
      const location = locationList.find((l) => l.id === item.location_id);

      return {
        id: item.id,
        tag: item.tag || "N/A",
        assetName: asset?.name || "Unknown",
        serialNumber: item.serial_number || "N/A",
        location: location?.name || "Unassigned",
        status: item.item_status || "Unknown",
        condition: item.item_condition || "Unknown",
        assignmentStatus: item.assignment_status || "Unknown",
        source: item.item_source || "Unknown",
        purchaseDate: item.purchase_date,
        warrantyExpiry: item.warranty_expiry,
      };
    });
  }, [filteredItems, assets, locations]);

  const searchTerm = pageSearch?.term || "";
  const filteredRows = useMemo(
    () => filterRowsBySearch(reportRows as any, searchTerm),
    [reportRows, searchTerm]
  );

  const dateRangeText = getDateRangeText(startDate, endDate);
  const filename = `asset-items-inventory-${new Date().toISOString().split("T")[0]}`;

  const columns = [
    { key: "tag", label: "Asset Tag" },
    { key: "assetName", label: "Asset Name" },
    { key: "serialNumber", label: "Serial Number" },
    { key: "location", label: "Location" },
    { key: "status", label: "Status" },
    { key: "condition", label: "Condition" },
    { key: "assignmentStatus", label: "Assignment Status" },
    { key: "source", label: "Source" },
    {
      key: "purchaseDate",
      label: "Purchase Date",
      render: (value: string) => formatDateForExport(value),
    },
    {
      key: "warrantyExpiry",
      label: "Warranty Expiry",
      render: (value: string) => formatDateForExport(value),
    },
  ];

  const handleExportCSV = () => {
    if (filteredRows.length === 0) {
      toast.error("No asset items available for the current filters");
      return;
    }

    exportToCSV(
      filteredRows as any,
      [
        { key: "tag", header: "Asset Tag" },
        { key: "assetName", header: "Asset Name" },
        { key: "serialNumber", header: "Serial Number" },
        { key: "location", header: "Location" },
        { key: "status", header: "Status" },
        { key: "condition", header: "Condition" },
        { key: "assignmentStatus", header: "Assignment Status" },
        { key: "source", header: "Source" },
        { key: "purchaseDate", header: "Purchase Date", formatter: (v) => formatDateForExport(v as string) },
        { key: "warrantyExpiry", header: "Warranty Expiry", formatter: (v) => formatDateForExport(v as string) },
      ],
      filename
    );
  };

  const handleExportPDF = () => {
    if (filteredRows.length === 0) {
      toast.error("No asset items available for the current filters");
      return;
    }

    generateReportPDF({
      title: "Asset Items Inventory Report",
      headers: ["Tag", "Asset", "Serial #", "Location", "Status", "Condition", "Assignment"],
      data: filteredRows.map((row) => [
        row.tag,
        row.assetName,
        row.serialNumber,
        row.location,
        row.status,
        row.condition,
        row.assignmentStatus,
      ]),
      filename,
      dateRangeText,
    });
  };

  return (
    <MainLayout title="Asset Items Inventory" description="Detailed inventory of asset items">
      <PageHeader
        title="Asset Items Inventory"
        description="Complete inventory of asset items with status and assignment details"
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
