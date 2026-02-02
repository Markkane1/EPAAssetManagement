import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Package, Coins, Calendar, Truck, Loader2, History } from "lucide-react";
import { useAssets } from "@/hooks/useAssets";
import { useAssetItems } from "@/hooks/useAssetItems";
import { useCategories } from "@/hooks/useCategories";
import { useVendors } from "@/hooks/useVendors";
import { useLocations } from "@/hooks/useLocations";
import { useAssignments } from "@/hooks/useAssignments";
import { useEmployees } from "@/hooks/useEmployees";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { AssignmentHistoryModal } from "@/components/shared/AssignmentHistoryModal";


export default function AssetDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [historyModal, setHistoryModal] = useState<{ open: boolean; item: any | null }>({
    open: false,
    item: null,
  });

  const { data: assets, isLoading: assetsLoading } = useAssets();
  const { data: assetItems } = useAssetItems();
  const { data: categories } = useCategories();
  const { data: vendors } = useVendors();
  const { data: locations } = useLocations();
  const { data: assignments } = useAssignments();
  const { data: employees } = useEmployees();

  const assetList = assets || [];
  const assetItemList = assetItems || [];
  const categoryList = categories || [];
  const vendorList = vendors || [];
  const locationList = locations || [];
  const assignmentList = assignments || [];
  const employeeList = employees || [];

  const asset = assetList.find((a) => a.id === id);
  const relatedItems = assetItemList.filter((item) => item.asset_id === id);
  const category = asset ? categoryList.find((c) => c.id === asset.category_id) : null;
  const vendor = asset?.vendor_id ? vendorList.find((v) => v.id === asset.vendor_id) : null;

  if (assetsLoading) {
    return (
      <MainLayout title="Asset Details" description="Loading...">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  if (!asset) {
    return (
      <MainLayout title="Asset Not Found" description="">
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <p className="text-muted-foreground">The requested asset could not be found.</p>
          <Button onClick={() => navigate("/assets")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Assets
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title={asset.name} description="Asset details and inventory">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/assets")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{asset.name}</h1>
              <p className="text-muted-foreground">{asset.description}</p>
            </div>
          </div>
          <div />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Info */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Asset Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-6">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Category</p>
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <Badge variant="secondary">{category?.name || "N/A"}</Badge>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Vendor</p>
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{vendor?.name || "N/A"}</span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Unit Price</p>
                <div className="flex items-center gap-2">
                  <Coins className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">PKR {asset.unit_price?.toLocaleString("en-PK") || 0}</span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Total Quantity</p>
                <span className="font-medium">{asset.quantity} units</span>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Acquisition Date</p>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>{asset.acquisition_date ? new Date(asset.acquisition_date).toLocaleDateString() : "N/A"}</span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Total Value</p>
                <span className="text-lg font-bold text-primary">
                  PKR {((asset.unit_price || 0) * (asset.quantity || 0)).toLocaleString("en-PK")}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Stats Card */}
          <Card>
            <CardHeader>
              <CardTitle>Inventory Status</CardTitle>
              <CardDescription>{relatedItems.length} items tracked</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Available</span>
                <Badge variant="default" className="bg-success">
                  {relatedItems.filter((i) => i.item_status === "Available").length}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Assigned</span>
                <Badge variant="secondary">
                  {relatedItems.filter((i) => i.item_status === "Assigned").length}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Maintenance</span>
                <Badge variant="outline" className="text-warning border-warning">
                  {relatedItems.filter((i) => i.item_status === "Maintenance").length}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Damaged</span>
                <Badge variant="destructive">
                  {relatedItems.filter((i) => i.item_status === "Damaged").length}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Asset Items Table */}
        <Card>
          <CardHeader>
            <CardTitle>Individual Items</CardTitle>
            <CardDescription>All tracked instances of this asset</CardDescription>
          </CardHeader>
          <CardContent>
            {relatedItems.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No items registered for this asset yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 font-medium">Tag</th>
                      <th className="text-left py-3 px-4 font-medium">Serial Number</th>
                      <th className="text-left py-3 px-4 font-medium">Location</th>
                      <th className="text-left py-3 px-4 font-medium">Status</th>
                      <th className="text-left py-3 px-4 font-medium">Assignment</th>
                      <th className="text-left py-3 px-4 font-medium">Warranty</th>
                      <th className="text-left py-3 px-4 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relatedItems.map((item) => {
                      const location = locationList.find((l) => l.id === item.location_id);
                      return (
                        <tr key={item.id} className="border-b hover:bg-muted/50">
                          <td className="py-3 px-4 font-mono font-medium text-primary">{item.tag}</td>
                          <td className="py-3 px-4 text-sm">{item.serial_number}</td>
                          <td className="py-3 px-4">{location?.name || "N/A"}</td>
                          <td className="py-3 px-4"><StatusBadge status={item.item_status || ""} /></td>
                          <td className="py-3 px-4"><StatusBadge status={item.assignment_status || ""} /></td>
                          <td className="py-3 px-4 text-sm">
                            {item.warranty_expiry ? (
                              <span className={new Date(item.warranty_expiry) < new Date() ? "text-destructive" : ""}>
                                {new Date(item.warranty_expiry).toLocaleDateString()}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="py-3 px-4">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setHistoryModal({ open: true, item })}
                            >
                              <History className="h-4 w-4 mr-1" />
                              History
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Assignment History Modal */}
      {historyModal.item && (
        <AssignmentHistoryModal
          open={historyModal.open}
          onOpenChange={(open) => setHistoryModal({ ...historyModal, open })}
          type="assetItem"
          targetId={historyModal.item.id}
          targetName={historyModal.item.tag || historyModal.item.serial_number || "Asset Item"}
          assignments={assignmentList}
          assetItems={assetItemList}
          employees={employeeList}
          assets={assetList}
        />
      )}
    </MainLayout>
  );
}
