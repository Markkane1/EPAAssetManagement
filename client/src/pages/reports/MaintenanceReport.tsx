import { useMemo, useState } from "react";
import { ReportTablePage } from "@/components/reports/ReportTablePage";
import { toast } from "sonner";
import { useMaintenance } from "@/hooks/useMaintenance";
import { useAssetItems } from "@/hooks/useAssetItems";
import { useAssets } from "@/hooks/useAssets";
import {
  exportToCSV,
  filterRowsBySearch,
  formatCurrencyForExport,
  formatDateForExport,
} from "@/lib/exportUtils";
import { filterByDateRange, generateReportPDF, getDateRangeText } from "@/lib/reporting";
import { usePageSearch } from "@/contexts/PageSearchContext";

export default function MaintenanceReport() {
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const pageSearch = usePageSearch();

  const { data: maintenance } = useMaintenance();
  const { data: assetItems } = useAssetItems();
  const { data: assets } = useAssets();

  const filteredMaintenance = useMemo(
    () => filterByDateRange(maintenance, "scheduled_date", startDate, endDate),
    [maintenance, startDate, endDate]
  );

  const reportRows = useMemo(() => {
    const itemList = assetItems || [];
    const assetList = assets || [];

    return filteredMaintenance.map((record) => {
      const assetItem = itemList.find((i) => i.id === record.asset_item_id);
      const asset = assetItem ? assetList.find((a) => a.id === assetItem.asset_id) : undefined;

      return {
        id: record.id,
        assetTag: assetItem?.tag || "N/A",
        assetName: asset?.name || "Unknown",
        maintenanceType: record.maintenance_type || "N/A",
        status: record.maintenance_status || "N/A",
        scheduledDate: record.scheduled_date,
        completedDate: record.completed_date,
        performedBy: record.performed_by || "",
        cost: record.cost || 0,
      };
    });
  }, [filteredMaintenance, assetItems, assets]);

  const searchTerm = pageSearch?.term || "";
  const filteredRows = useMemo(
    () => filterRowsBySearch(reportRows as any, searchTerm),
    [reportRows, searchTerm]
  );

  const dateRangeText = getDateRangeText(startDate, endDate);
  const filename = `maintenance-report-${new Date().toISOString().split("T")[0]}`;

  const columns = [
    { key: "assetTag", label: "Asset Tag" },
    { key: "assetName", label: "Asset Name" },
    { key: "maintenanceType", label: "Type" },
    { key: "status", label: "Status" },
    {
      key: "scheduledDate",
      label: "Scheduled",
      render: (value: string) => formatDateForExport(value),
    },
    {
      key: "completedDate",
      label: "Completed",
      render: (value: string) => formatDateForExport(value),
    },
    {
      key: "cost",
      label: "Cost",
      render: (value: number) => formatCurrencyForExport(value),
    },
    { key: "performedBy", label: "Performed By" },
  ];

  const handleExportCSV = () => {
    if (filteredRows.length === 0) {
      toast.error("No maintenance records available for the current filters");
      return;
    }

    exportToCSV(
      filteredRows as any,
      [
        { key: "assetTag", header: "Asset Tag" },
        { key: "assetName", header: "Asset Name" },
        { key: "maintenanceType", header: "Type" },
        { key: "status", header: "Status" },
        { key: "scheduledDate", header: "Scheduled Date", formatter: (v) => formatDateForExport(v as string) },
        { key: "completedDate", header: "Completed Date", formatter: (v) => formatDateForExport(v as string) },
        { key: "cost", header: "Cost", formatter: (v) => formatCurrencyForExport(v as number) },
        { key: "performedBy", header: "Performed By" },
      ],
      filename
    );
  };

  const handleExportPDF = async () => {
    if (filteredRows.length === 0) {
      toast.error("No maintenance records available for the current filters");
      return;
    }

    await generateReportPDF({
      title: "Maintenance Report",
      headers: ["Tag", "Asset", "Type", "Status", "Scheduled", "Completed", "Cost"],
      data: filteredRows.map((row) => [
        row.assetTag,
        row.assetName,
        row.maintenanceType,
        row.status,
        formatDateForExport(row.scheduledDate),
        formatDateForExport(row.completedDate),
        formatCurrencyForExport(row.cost),
      ]),
      filename,
      dateRangeText,
    });
  };

  return (
    <ReportTablePage
      title="Maintenance Report"
      description="Maintenance records, schedules, and costs"
      layoutDescription="Maintenance records and costs"
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
