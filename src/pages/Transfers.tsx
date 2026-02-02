import { useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { ExportButton } from "@/components/shared/ExportButton";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Eye, ArrowRightLeft, MapPin, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TransferHistory } from "@/types";
import { useTransfers, useCreateTransfer } from "@/hooks/useTransfers";
import { useAssetItems } from "@/hooks/useAssetItems";
import { useAssets } from "@/hooks/useAssets";
import { useLocations } from "@/hooks/useLocations";
import { TransferFormModal } from "@/components/forms/TransferFormModal";
import { exportToCSV, exportToJSON, filterRowsBySearch, formatDateForExport, pickExportFields } from "@/lib/exportUtils";
import { usePageSearch } from "@/contexts/PageSearchContext";
import { useAuth } from "@/contexts/AuthContext";

export default function Transfers() {
  const { data: transfers, isLoading, error } = useTransfers();
  const { data: assetItems } = useAssetItems();
  const { data: assets } = useAssets();
  const { data: locations } = useLocations();
  const { role, locationId } = useAuth();
  const createTransfer = useCreateTransfer();
  const pageSearch = usePageSearch();

  const [isModalOpen, setIsModalOpen] = useState(false);

  const transferList = useMemo(() => {
    const list = transfers || [];
    if (role === "location_admin") {
      if (!locationId) return [];
      return list.filter((transfer) =>
        transfer.from_location_id === locationId || transfer.to_location_id === locationId
      );
    }
    return list;
  }, [transfers, role, locationId]);
  const assetItemList = assetItems || [];
  const assetList = assets || [];
  const locationList = locations || [];

  const enrichedTransfers = transferList.map((transfer) => {
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

  const columns = [
    {
      key: "itemTag",
      label: "Asset Tag",
      render: (value: string) => (
        <span className="font-mono font-medium text-primary">{value}</span>
      ),
    },
    {
      key: "assetName",
      label: "Asset",
      render: (value: string) => (
        <span className="font-medium">{value}</span>
      ),
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
      label: "To",
      render: (value: string) => (
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="h-4 w-4 text-primary" />
          <span className="font-medium">{value}</span>
        </div>
      ),
    },
    {
      key: "transfer_date",
      label: "Transfer Date",
      render: (value: string) => new Date(value).toLocaleDateString(),
    },
    {
      key: "performed_by",
      label: "Performed By",
      render: (value: string) => (
        <span className="text-muted-foreground">{value}</span>
      ),
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

  const filteredTransfers = useMemo(
    () => filterRowsBySearch(enrichedTransfers as any, pageSearch?.term || ""),
    [enrichedTransfers, pageSearch?.term],
  );

  const handleNewTransfer = () => {
    setIsModalOpen(true);
  };

  const handleSubmit = async (data: {
    assetItemIds: string[];
    fromLocationId: string;
    toLocationId: string;
    transferDate: string;
    reason: string;
    performedBy: string;
  }) => {
    await Promise.all(
      data.assetItemIds.map((assetItemId) =>
        createTransfer.mutateAsync({
          assetItemId,
          fromLocationId: data.fromLocationId,
          toLocationId: data.toLocationId,
          transferDate: data.transferDate,
          reason: data.reason,
          performedBy: data.performedBy,
        })
      )
    );
  };

  const actions = (row: any) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem>
          <Eye className="h-4 w-4 mr-2" /> View Details
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (isLoading) {
    return (
      <MainLayout title="Transfers" description="Track asset location changes">
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
    exportToCSV(filteredTransfers as any, [
      { key: "itemTag", header: "Asset Tag" },
      { key: "assetName", header: "Asset Name" },
      { key: "fromLocationName", header: "From Location" },
      { key: "toLocationName", header: "To Location" },
      { key: "transfer_date", header: "Transfer Date", formatter: (v) => formatDateForExport(v as Date) },
      { key: "performed_by", header: "Performed By" },
      { key: "reason", header: "Reason" },
    ], "transfers");
  };

  const handleExportJSON = () => {
    exportToJSON(
      pickExportFields(filteredTransfers as any, [
        "itemTag",
        "assetName",
        "fromLocationName",
        "toLocationName",
        "transfer_date",
        "performed_by",
        "reason",
      ]),
      "transfers",
    );
  };

  return (
    <MainLayout title="Transfers" description="Track asset location changes">
      <PageHeader
        title="Asset Transfers"
        description="Track and manage asset movements between locations"
        action={{
          label: "New Transfer",
          onClick: handleNewTransfer,
        }}
        extra={<ExportButton onExportCSV={handleExportCSV} onExportJSON={handleExportJSON} />}
      />

      <DataTable
        columns={columns}
        data={enrichedTransfers}
        searchPlaceholder="Search transfers..."
        actions={actions}
      />

      <TransferFormModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        assetItems={assetItemList as any}
        locations={locationList as any}
        assets={assetList as any}
        onSubmit={handleSubmit}
      />
    </MainLayout>
  );
}
