import { MainLayout } from "@/components/layout/MainLayout";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { AssetsByCategory } from "@/components/dashboard/AssetsByCategory";
import { AssetStatusChart } from "@/components/dashboard/AssetStatusChart";
import { PendingPurchaseOrders } from "@/components/dashboard/PendingPurchaseOrders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Package, 
  PackageOpen, 
  UserCheck, 
  Wrench, 
  DollarSign, 
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Loader2
} from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Link } from "react-router-dom";
import { useDashboardStats } from "@/hooks/useDashboard";
import { useAssetItems } from "@/hooks/useAssetItems";
import { useLocations } from "@/hooks/useLocations";
import { useMemo } from "react";
import { getOfficeHolderId, isStoreHolder } from "@/lib/assetItemHolder";

function safeId(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

export default function Dashboard() {
  const { data: dashboardStats, isLoading: statsLoading } = useDashboardStats();
  const { data: assetItems } = useAssetItems();
  const { data: locations } = useLocations();

  const stats = dashboardStats || {
    totalAssets: 0,
    totalAssetItems: 0,
    assignedItems: 0,
    availableItems: 0,
    maintenanceItems: 0,
    totalValue: 0,
    lowStockAlerts: 0,
  };
  const assetItemList = useMemo(() => assetItems || [], [assetItems]);
  const locationList = useMemo(() => locations || [], [locations]);

  const recentItems = assetItemList.slice(0, 5);
  const locationCounts = useMemo(() => {
    const counts = new Map<string, number>();
    assetItemList.forEach((item) => {
      const officeId = getOfficeHolderId(item);
      if (!officeId) return;
      counts.set(officeId, (counts.get(officeId) || 0) + 1);
    });
    return counts;
  }, [assetItemList]);
  const storeItemCount = useMemo(
    () => assetItemList.filter((item) => isStoreHolder(item)).length,
    [assetItemList]
  );

  if (statsLoading) {
    return (
      <MainLayout title="Dashboard" description="Overview of your asset management">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Dashboard" description="Overview of your asset management">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatsCard
          title="Total Assets"
          value={stats.totalAssets}
          subtitle="Unique asset types"
          icon={Package}
          variant="primary"
          trend={{ value: 12, isPositive: true }}
        />
        <StatsCard
          title="Total Items"
          value={stats.totalAssetItems}
          subtitle="Individual asset items"
          icon={PackageOpen}
          variant="info"
        />
        <StatsCard
          title="Assigned Items"
          value={stats.assignedItems}
          subtitle={`${stats.totalAssetItems ? Math.round((stats.assignedItems / stats.totalAssetItems) * 100) : 0}% utilization`}
          icon={UserCheck}
          variant="success"
        />
        <StatsCard
          title="In Maintenance"
          value={stats.maintenanceItems}
          subtitle="Requires attention"
          icon={Wrench}
          variant="warning"
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatsCard
          title="Total Asset Value"
          value={`PKR ${(stats.totalValue || 0).toLocaleString("en-PK")}`}
          icon={DollarSign}
          variant="accent"
        />
        <StatsCard
          title="Available Items"
          value={stats.availableItems}
          subtitle="Ready for assignment"
          icon={TrendingUp}
          variant="success"
        />
        <StatsCard
          title="Low Stock Alerts"
          value={stats.lowStockAlerts || 0}
          subtitle="Categories need restocking"
          icon={AlertTriangle}
          variant="warning"
        />
      </div>

      {/* Charts & Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-1">
          <AssetStatusChart />
        </div>
        <div className="lg:col-span-1">
          <AssetsByCategory />
        </div>
        <div className="lg:col-span-1">
          <RecentActivity />
        </div>
      </div>

      {/* Purchase Orders Widget */}
      <div className="mb-8">
        <PendingPurchaseOrders />
      </div>

      {/* Quick Access Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Asset Items */}
        <Card className="animate-fade-in">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-lg font-semibold">Recent Asset Items</CardTitle>
            <Link to="/asset-items">
              <Button variant="ghost" size="sm" className="gap-1">
                View all <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentItems.map((item, index) => {
                const itemId = safeId(item.id) || safeId((item as Record<string, unknown>)._id);
                const itemKey = itemId || `recent-item-${index}-${item.tag || "untagged"}-${item.serial_number || "noserial"}`;
                return (
                  <div
                    key={`${itemKey}-${index}`}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <PackageOpen className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">Tag: {item.tag}</p>
                        <p className="text-xs text-muted-foreground">{item.serial_number}</p>
                      </div>
                    </div>
                    <StatusBadge status={item.item_status || ""} />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Locations Overview */}
        <Card className="animate-fade-in">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-lg font-semibold">Locations Overview</CardTitle>
            <Link to="/offices">
              <Button variant="ghost" size="sm" className="gap-1">
                View all <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {locationList.slice(0, 5).map((location, index) => {
                const locationId = safeId(location.id) || safeId((location as Record<string, unknown>)._id);
                const locationKey = locationId || `location-${index}-${location.name || "unknown"}`;
                return (
                  <div
                    key={`${locationKey}-${index}`}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-sm">{location.name}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {location.address}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-sm">
                        {locationCounts.get(locationId || "") || 0}
                      </p>
                      <p className="text-xs text-muted-foreground">assets</p>
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                <div>
                  <p className="font-medium text-sm">Head Office Store</p>
                  <p className="text-xs text-muted-foreground truncate max-w-[200px]">System Store</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-sm">{storeItemCount}</p>
                  <p className="text-xs text-muted-foreground">assets</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
