import { useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Pencil } from "lucide-react";
import { useAssetItems, useUpdateAssetItem } from "@/hooks/useAssetItems";
import { useAssets } from "@/hooks/useAssets";
import { useLocations } from "@/hooks/useLocations";
import { useAuth } from "@/contexts/AuthContext";
import { isHeadOfficeLocation } from "@/lib/locationUtils";

const functionalOptions = ["Functional", "Need Repairs", "Dead"];

export default function FunctionalStatus() {
  const { role, locationId } = useAuth();
  const { data: assetItems, isLoading, error } = useAssetItems();
  const { data: assets } = useAssets();
  const { data: locations } = useLocations();
  const updateAssetItem = useUpdateAssetItem();

  const [editItemId, setEditItemId] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>("Functional");

  const assetList = assets || [];
  const locationList = locations || [];
  const assetItemList = assetItems || [];

  const filteredItems = useMemo(() => {
    const nonHeadOfficeItems = assetItemList.filter((item) => {
      const location = locationList.find((loc) => loc.id === item.location_id);
      return location && !isHeadOfficeLocation(location);
    });

    if (role === "location_admin") {
      if (!locationId) return [];
      return nonHeadOfficeItems.filter((item) => item.location_id === locationId);
    }

    return nonHeadOfficeItems;
  }, [assetItemList, locationList, role, locationId]);

  const enrichedItems = filteredItems.map((item) => ({
    ...item,
    assetName: assetList.find((asset) => asset.id === item.asset_id)?.name || "N/A",
    locationName: locationList.find((loc) => loc.id === item.location_id)?.name || "N/A",
  }));

  const columns = [
    { key: "tag", label: "Tag" },
    { key: "assetName", label: "Asset" },
    { key: "locationName", label: "Location" },
    { key: "item_status", label: "Status", render: (value: string) => <StatusBadge status={value || ""} /> },
    { key: "item_condition", label: "Condition" },
    { key: "functional_status", label: "Functional", render: (value: string) => <StatusBadge status={value || ""} /> },
  ];

  const handleOpen = (item: any) => {
    setEditItemId(item.id);
    setSelectedStatus(item.functional_status || "Functional");
  };

  const handleSave = async () => {
    if (!editItemId) return;
    await updateAssetItem.mutateAsync({
      id: editItemId,
      data: { functionalStatus: selectedStatus },
    });
    setEditItemId(null);
  };

  if (isLoading) {
    return (
      <MainLayout title="Functional Status" description="Update asset functional status">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  if (error) console.warn("API unavailable:", error);

  return (
    <MainLayout title="Functional Status" description="Track and update functional status">
      <PageHeader
        title="Functional Status"
        description="Update the functional status for transferred asset items"
      />
      <DataTable
        columns={columns}
        data={enrichedItems as any}
        searchPlaceholder="Search assets..."
        actions={(row) => (
          <Button variant="ghost" size="icon" onClick={() => handleOpen(row)}>
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      />

      <Dialog open={!!editItemId} onOpenChange={(open) => !open && setEditItemId(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Update Functional Status</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Functional Status</Label>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {functionalOptions.map((status) => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItemId(null)}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
