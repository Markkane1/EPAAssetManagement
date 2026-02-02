import { useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { ExportButton } from "@/components/shared/ExportButton";
import { MapPin, ArrowRightLeft, Loader2 } from "lucide-react";
import { useTransfers } from "@/hooks/useTransfers";
import { useAssetItems } from "@/hooks/useAssetItems";
import { useAssets } from "@/hooks/useAssets";
import { useLocations } from "@/hooks/useLocations";
import { useAuth } from "@/contexts/AuthContext";
import { isHeadOfficeLocation } from "@/lib/locationUtils";
import { exportToCSV, exportToJSON, filterRowsBySearch, formatDateForExport, pickExportFields } from "@/lib/exportUtils";
import { usePageSearch } from "@/contexts/PageSearchContext";

export default function Returns() {
  const { data: transfers, isLoading, error } = useTransfers();
  const { data: assetItems } = useAssetItems();
  const { data: assets } = useAssets();
  const { data: locations } = useLocations();
  const { role, locationId } = useAuth();
  const pageSearch = usePageSearch();

  const transferList = transfers || [];
  const assetItemList = assetItems || [];
  const assetList = assets || [];
  const locationList = locations || [];

  const headOffice = locationList.find((location) => isHeadOfficeLocation(location));

  const filteredTransfers = useMemo(() => {
    if (!headOffice) return [];
    let list = transferList.filter((transfer) => transfer.to_location_id === headOffice.id);
    if (role === "location_admin") {
      if (!locationId) return [];
      list = list.filter((transfer) => transfer.from_location_id === locationId);
    }
    return list;
  }, [transferList, headOffice, role, locationId]);

  const enrichedTransfers = useMemo(() => {
    return filteredTransfers.map((transfer) => {
      const item = assetItemList.find((i) => i.id === transfer.asset_item_id);
      const asset = item ? assetList.find((a) => a.id === item.asset_id) : null;
      const fromLocation = locationList.find((l) => l.id === transfer.from_location_id);
      const toLocation = locationList.find((l) => l.id === transfer.to_location_id);
      return {
        ...transfer,
        assetName: asset?.name || "N/A",
        itemTag: item?.tag || "N/A",
        fromLocationName: fromLocation?.name || "N/A",
        toLocationName: toLocation?.name || "N/A",
      };
    });
  }, [filteredTransfers, assetItemList, assetList, locationList]);

  const searchedTransfers = useMemo(
    () => filterRowsBySearch(enrichedTransfers as any, pageSearch?.term || ""),
    [enrichedTransfers, pageSearch?.term],
  );

  const columns = [
    {
      key: "itemTag",
      label: "Asset Tag",
      render: (value: string) => <span className="font-mono font-medium text-primary">{value}</span>,
    },
    {
      key: "assetName",
      label: "Asset",
      render: (value: string) => <span className="font-medium">{value}</span>,
    },
    {
      key: "fromLocationName",
      label: "From",
      render: (value: string) => (
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <span>{value}</span>
        </div>
      ),
    },
    {
      key: "toLocationName",
      label: "Returned To",
      render: (value: string) => (
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="h-4 w-4 text-primary" />
          <span className="font-medium">{value}</span>
        </div>
      ),
    },
    {
      key: "transfer_date",
      label: "Return Date",
      render: (value: string) => new Date(value).toLocaleDateString(),
    },
    {
      key: "performed_by",
      label: "Performed By",
      render: (value: string) => <span className="text-muted-foreground">{value}</span>,
    },
    {
      key: "reason",
      label: "Reason",
      render: (value: string) => (
        <span className="text-sm text-muted-foreground truncate max-w-[200px] block">
          {value}
        </span>
      ),
    },
  ];

  if (isLoading) {
    return (
      <MainLayout title="Returns" description="Track assets returned to head office">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  if (error) {
    console.warn("API unavailable:", error);
  }

  const handleExportCSV = () => {
    exportToCSV(searchedTransfers as any, [
      { key: "itemTag", header: "Asset Tag" },
      { key: "assetName", header: "Asset Name" },
      { key: "fromLocationName", header: "From Location" },
      { key: "toLocationName", header: "Returned To" },
      { key: "transfer_date", header: "Return Date", formatter: (v) => formatDateForExport(v as Date) },
      { key: "performed_by", header: "Performed By" },
      { key: "reason", header: "Reason" },
    ], "returns");
  };

  const handleExportJSON = () => {
    exportToJSON(
      pickExportFields(searchedTransfers as any, [
        "itemTag",
        "assetName",
        "fromLocationName",
        "toLocationName",
        "transfer_date",
        "performed_by",
        "reason",
      ]),
      "returns",
    );
  };

  return (
    <MainLayout title="Returns" description="Track assets returned to head office">
      <PageHeader
        title="Returns"
        description="History of assets returned to head office"
        extra={<ExportButton onExportCSV={handleExportCSV} onExportJSON={handleExportJSON} />}
      />
      <DataTable
        columns={columns}
        data={enrichedTransfers}
        searchPlaceholder="Search returns..."
      />
    </MainLayout>
  );
}
