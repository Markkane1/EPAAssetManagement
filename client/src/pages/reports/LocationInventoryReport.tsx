import { useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { DateRangeFilter } from "@/components/reports/DateRangeFilter";
import { Button } from "@/components/ui/button";
import { Download, FileDown } from "lucide-react";
import { toast } from "sonner";
import { useLocations } from "@/hooks/useLocations";
import { useAssetItems } from "@/hooks/useAssetItems";
import { useAssets } from "@/hooks/useAssets";
import {
  exportToCSV,
  filterRowsBySearch,
  formatCurrencyForExport,
} from "@/lib/exportUtils";
import { filterByDateRange, generateReportPDF, getDateRangeText } from "@/lib/reporting";
import { usePageSearch } from "@/contexts/PageSearchContext";

export default function LocationInventoryReport() {
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const pageSearch = usePageSearch();

  const { data: locations } = useLocations();
  const { data: assetItems } = useAssetItems();
  const { data: assets } = useAssets();

  const filteredItems = useMemo(
    () => filterByDateRange(assetItems, "created_at", startDate, endDate),
    [assetItems, startDate, endDate]
  );

  const reportRows = useMemo(() => {
    const locationList = locations || [];
    const assetValueById = new Map((assets || []).map((asset) => [asset.id, asset.unit_price || 0]));
    const itemsByLocation = new Map<string, typeof filteredItems>();
    filteredItems.forEach((item) => {
      const existing = itemsByLocation.get(item.location_id) || [];
      itemsByLocation.set(item.location_id, [...existing, item]);
    });

    return locationList.map((location) => {
      const itemsAtLocation = itemsByLocation.get(location.id) || [];
      const totalValue = itemsAtLocation.reduce((sum, item) => {
        return sum + (assetValueById.get(item.asset_id) || 0);
      }, 0);

      const statusBreakdown = itemsAtLocation.reduce((acc, item) => {
        const status = item.item_status || "Unknown";
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return {
        id: location.id,
        locationName: location.name,
        address: location.address || "",
        totalItems: itemsAtLocation.length,
        totalValue,
        available: statusBreakdown["Available"] || 0,
        assigned: statusBreakdown["Assigned"] || 0,
        maintenance: statusBreakdown["Maintenance"] || 0,
        damaged: statusBreakdown["Damaged"] || 0,
        retired: statusBreakdown["Retired"] || 0,
      };
    });
  }, [locations, filteredItems, assets]);

  const searchTerm = pageSearch?.term || "";
  const filteredRows = useMemo(
    () => filterRowsBySearch(reportRows as any, searchTerm),
    [reportRows, searchTerm]
  );

  const dateRangeText = getDateRangeText(startDate, endDate);
  const filename = `location-inventory-${new Date().toISOString().split("T")[0]}`;

  const columns = [
    { key: "locationName", label: "Location" },
    { key: "address", label: "Address" },
    { key: "totalItems", label: "Total Items" },
    {
      key: "totalValue",
      label: "Total Value",
      render: (value: number) => formatCurrencyForExport(value),
    },
    { key: "available", label: "Available" },
    { key: "assigned", label: "Assigned" },
    { key: "maintenance", label: "In Maintenance" },
    { key: "damaged", label: "Damaged" },
    { key: "retired", label: "Retired" },
  ];

  const handleExportCSV = () => {
    if (filteredRows.length === 0) {
      toast.error("No location inventory data available for the current filters");
      return;
    }

    exportToCSV(
      filteredRows as any,
      [
        { key: "locationName", header: "Location" },
        { key: "address", header: "Address" },
        { key: "totalItems", header: "Total Items" },
        { key: "totalValue", header: "Total Value", formatter: (v) => formatCurrencyForExport(v as number) },
        { key: "available", header: "Available" },
        { key: "assigned", header: "Assigned" },
        { key: "maintenance", header: "In Maintenance" },
        { key: "damaged", header: "Damaged" },
        { key: "retired", header: "Retired" },
      ],
      filename
    );
  };

  const handleExportPDF = () => {
    if (filteredRows.length === 0) {
      toast.error("No location inventory data available for the current filters");
      return;
    }

    generateReportPDF({
      title: "Location Inventory Report",
      headers: ["Location", "Items", "Value", "Available", "Assigned", "Maintenance", "Damaged"],
      data: filteredRows.map((row) => [
        row.locationName,
        row.totalItems,
        formatCurrencyForExport(row.totalValue),
        row.available,
        row.assigned,
        row.maintenance,
        row.damaged,
      ]),
      filename,
      dateRangeText,
    });
  };

  return (
    <MainLayout title="Location Inventory" description="Inventory by location">
      <PageHeader
        title="Location Inventory"
        description="Detailed inventory totals by physical location"
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
