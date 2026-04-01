import { useMemo } from "react";
import { Link } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { AssetsByCategory } from "@/components/dashboard/AssetsByCategory";
import { AssetStatusChart } from "@/components/dashboard/AssetStatusChart";
import { PendingPurchaseOrders } from "@/components/dashboard/PendingPurchaseOrders";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Package,
  PackageOpen,
  UserCheck,
  Wrench,
  DollarSign,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Loader2,
  ClipboardList,
  RotateCcw,
  AlertCircle,
} from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useDashboardMe, useDashboardPanels, useDashboardStats } from "@/hooks/useDashboard";
import { useAssignmentsByEmployee } from "@/hooks/useAssignments";
import { useConsumableBalances } from "@/hooks/useConsumableInventory";
import { useAuth } from "@/contexts/AuthContext";
import { usePageSearch } from "@/contexts/PageSearchContext";
import { TimelineList, WorkflowPanel } from "@/components/shared/workflow";

function safeId(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

export default function Dashboard() {
  const { role } = useAuth();
  const isEmployee = role === "employee";
  const loadAdminCollections = !isEmployee;
  const { data: dashboardStats, isLoading: statsLoading } = useDashboardStats({
    enabled: loadAdminCollections,
  });
  const dashboardMeQuery = useDashboardMe({ enabled: isEmployee });
  const pageSearch = usePageSearch();
  const searchTerm = (pageSearch?.term || "").trim().toLowerCase();
  const dashboardPanelsQuery = useDashboardPanels(searchTerm, {
    enabled: loadAdminCollections,
  });
  const currentEmployeeId = dashboardMeQuery.data?.employeeId || null;

  const { data: employeeAssignmentData, isLoading: employeeAssignmentsLoading } = useAssignmentsByEmployee(currentEmployeeId || "");

  const employeeConsumableBalancesQuery = useConsumableBalances(
    currentEmployeeId
      ? {
          holderType: "EMPLOYEE",
          holderId: String(currentEmployeeId),
        }
      : undefined,
    { enabled: isEmployee && Boolean(currentEmployeeId) }
  );

  const employeeAssignments = useMemo(() => {
    if (!isEmployee || !currentEmployeeId) return [];
    const assignmentList = employeeAssignmentData || [];
    return assignmentList.filter((assignment) => {
      const employeeId = safeId((assignment as Record<string, unknown>).employee_id);
      const targetEmployeeId = safeId((assignment as Record<string, unknown>).assigned_to_id);
      const targetType = String((assignment as Record<string, unknown>).assigned_to_type || "").toUpperCase();
      return employeeId === currentEmployeeId || (targetType === "EMPLOYEE" && targetEmployeeId === currentEmployeeId);
    });
  }, [currentEmployeeId, employeeAssignmentData, isEmployee]);

  const employeeActiveAssignments = useMemo(
    () =>
      employeeAssignments.filter((assignment) => {
        const status = String((assignment as Record<string, unknown>).status || "").toUpperCase();
        return status === "ISSUED" || status === "RETURN_REQUESTED" || Boolean((assignment as Record<string, unknown>).is_active);
      }),
    [employeeAssignments]
  );
  const employeeReturnRequestedCount = useMemo(
    () =>
      employeeAssignments.filter(
        (assignment) => String((assignment as Record<string, unknown>).status || "").toUpperCase() === "RETURN_REQUESTED"
      ).length,
    [employeeAssignments]
  );

  const employeeConsumableBalances = useMemo(
    () => employeeConsumableBalancesQuery.data || [],
    [employeeConsumableBalancesQuery.data]
  );
  const employeeConsumableLines = useMemo(
    () =>
      employeeConsumableBalances.filter(
        (balance) =>
          String((balance as Record<string, unknown>).holder_type || "").toUpperCase() === "EMPLOYEE" &&
          Number((balance as Record<string, unknown>).qty_on_hand_base || 0) > 0
      ),
    [employeeConsumableBalances]
  );
  const employeeConsumableQtyTotal = useMemo(
    () =>
      employeeConsumableLines.reduce(
        (sum, row) => sum + Number((row as Record<string, unknown>).qty_on_hand_base || 0),
        0
      ),
    [employeeConsumableLines]
  );

  const employeeOpenRequisitionsCount = dashboardMeQuery.data?.openRequisitionsCount || 0;
  const employeeOpenReturnsCount = dashboardMeQuery.data?.openReturnsCount || 0;

  const employeeLoading =
    isEmployee &&
    (dashboardMeQuery.isLoading ||
      employeeAssignmentsLoading ||
      employeeConsumableBalancesQuery.isLoading);

  const stats = dashboardStats || {
    totalAssets: 0,
    totalAssetItems: 0,
    assignedItems: 0,
    availableItems: 0,
    maintenanceItems: 0,
    totalValue: 0,
    lowStockAlerts: 0,
  };
  const recentItems = dashboardPanelsQuery.data?.recentItems || [];
  const visibleLocations = dashboardPanelsQuery.data?.locations || [];
  const storeItemCount = dashboardPanelsQuery.data?.storeItemCount || 0;
  const showStoreRow =
    !searchTerm || "head office store system store".toLowerCase().includes(searchTerm);

  if (employeeLoading) {
    return (
      <MainLayout title="Dashboard" description="Overview of your services and assigned assets">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  if (isEmployee) {
    const employeeTimeline = employeeAssignments.slice(0, 5).map((assignment, index) => {
      const key = safeId((assignment as Record<string, unknown>).id) || safeId((assignment as Record<string, unknown>)._id) || `employee-assignment-${index}`;
      const status = String((assignment as Record<string, unknown>).status || "UNKNOWN");
      const statusLabel = status
        .toLowerCase()
        .split("_")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
      return {
        id: key,
        title: `Issued asset ${key.slice(-8)}`,
        description: `Status: ${status}`,
        meta: String((assignment as Record<string, unknown>).assigned_date || "")
          ? new Date(String((assignment as Record<string, unknown>).assigned_date || "")).toLocaleDateString()
          : "Date unavailable",
        badge: statusLabel,
        icon: status === "RETURN_REQUESTED" ? RotateCcw : Package,
      };
    });

    return (
      <MainLayout title="Dashboard" description="Overview of your services and assigned assets">
        <PageHeader
          title="Dashboard"
          description="Track your assigned assets, consumables, requisitions, and return requests."
          eyebrow="Personal workspace"
          meta={
            <>
              <span>{employeeActiveAssignments.length} active assignments</span>
              <span className="hidden h-1 w-1 rounded-full bg-border sm:inline-block" />
              <span>{employeeOpenRequisitionsCount} open requisitions</span>
            </>
          }
        />

        {!currentEmployeeId && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Employee mapping missing</AlertTitle>
            <AlertDescription>
              Your login is not linked to an employee profile. Contact your administrator.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatsCard
            title="Assigned Moveable"
            value={employeeActiveAssignments.length}
            subtitle="Currently issued to you"
            icon={Package}
            variant="primary"
          />
          <StatsCard
            title="Consumable Lines"
            value={employeeConsumableLines.length}
            subtitle={`${employeeConsumableQtyTotal.toLocaleString()} total qty on hand`}
            icon={PackageOpen}
            variant="info"
          />
          <StatsCard
            title="Open Requisitions"
            value={employeeOpenRequisitionsCount}
            subtitle="Pending approval/fulfillment"
            icon={ClipboardList}
            variant="warning"
          />
          <StatsCard
            title="Open Return Requests"
            value={employeeOpenReturnsCount}
            subtitle={`${employeeReturnRequestedCount} assignment return requested`}
            icon={RotateCcw}
            variant="success"
          />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <WorkflowPanel title="Quick Actions" description="Jump straight into the most common self-service tasks.">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Button asChild variant="outline">
                <Link to="/my-assets">My Assets</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/requisitions">My Requisitions</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/returns">My Return Requests</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/consumables/consume">Consumable Consumption</Link>
              </Button>
            </div>
          </WorkflowPanel>

          <WorkflowPanel title="Recent assignment activity" description="Your latest issued or returned asset records.">
            <TimelineList
              items={employeeTimeline}
              emptyTitle="No assignment records yet"
              emptyDescription="Assignment history will appear here after your first issued asset."
            />
          </WorkflowPanel>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Recent Assignment Records</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {employeeAssignments.slice(0, 5).map((assignment, index) => {
                const status = String((assignment as Record<string, unknown>).status || "UNKNOWN");
                const assignedDate = String((assignment as Record<string, unknown>).assigned_date || "");
                const key = safeId((assignment as Record<string, unknown>).id) || safeId((assignment as Record<string, unknown>)._id) || `employee-assignment-${index}`;
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                  >
                    <div>
                      <p className="text-sm font-medium">Assignment {key.slice(-8)}</p>
                      <p className="text-xs text-muted-foreground">
                        {assignedDate ? new Date(assignedDate).toLocaleDateString() : "Date N/A"}
                      </p>
                    </div>
                    <StatusBadge status={status} />
                  </div>
                );
              })}
              {employeeAssignments.length === 0 && (
                <p className="text-sm text-muted-foreground">No assignment records yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    );
  }

  if (statsLoading || dashboardPanelsQuery.isLoading) {
    return (
      <MainLayout title="Dashboard" description="Overview of your asset management">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  const recentItemsTimeline = recentItems.slice(0, 5).map((item, index) => {
    const itemId = safeId(item.id) || safeId((item as Record<string, unknown>)._id) || `recent-item-${index}`;
    return {
      id: itemId,
      title: item.tag || "Untitled asset item",
      description: item.serial_number || "Serial unavailable",
      meta: String(item.item_status || "UNKNOWN"),
      badge: String(item.item_status || "UNKNOWN"),
      icon: PackageOpen,
    };
  });

  return (
    <MainLayout title="Dashboard" description="Overview of your asset management">
      <PageHeader
        title="Dashboard"
        description="Monitor key asset health, operational queues, and recent inventory activity."
        eyebrow="Operations overview"
        meta={
          <>
            <span>{stats.totalAssetItems.toLocaleString()} total items</span>
            <span className="hidden h-1 w-1 rounded-full bg-border sm:inline-block" />
            <span>{stats.lowStockAlerts || 0} low-stock alerts</span>
          </>
        }
      />

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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 mb-8">
        <div className="lg:col-span-1">
          <WorkflowPanel title="Asset status" description="Current item mix across the asset lifecycle." contentClassName="pt-3">
            <AssetStatusChart />
          </WorkflowPanel>
        </div>
        <div className="lg:col-span-1">
          <WorkflowPanel title="Categories" description="See where the portfolio is concentrated." contentClassName="pt-3">
            <AssetsByCategory />
          </WorkflowPanel>
        </div>
        <div className="lg:col-span-1">
          <WorkflowPanel title="Recent activity" description="Latest system actions across key workflows." contentClassName="pt-3">
            <RecentActivity />
          </WorkflowPanel>
        </div>
      </div>

      <div className="mb-8">
        <WorkflowPanel title="Pending purchase orders" description="Items that may affect replenishment and assignment planning." contentClassName="pt-3">
          <PendingPurchaseOrders />
        </WorkflowPanel>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
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

        <div className="space-y-6">
          <WorkflowPanel title="Locations Overview" description="The busiest locations and store availability.">
            <div className="space-y-3">
              {visibleLocations.map((location, index) => {
                const locationId = safeId(location.id) || safeId((location as Record<string, unknown>)._id);
                const locationKey = locationId || `location-${index}-${location.name || "unknown"}`;
                return (
                  <div
                    key={`${locationKey}-${index}`}
                    className="flex items-center justify-between rounded-2xl bg-muted/35 p-3 transition-colors hover:bg-muted/55"
                  >
                    <div>
                      <p className="font-medium text-sm">{location.name}</p>
                      <p className="max-w-[220px] break-words text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                        {location.address}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-sm">{location.assetCount}</p>
                      <p className="text-xs text-muted-foreground">assets</p>
                    </div>
                  </div>
                );
              })}
              {showStoreRow && (
                <div className="flex items-center justify-between rounded-2xl bg-muted/35 p-3 transition-colors hover:bg-muted/55">
                  <div>
                    <p className="font-medium text-sm">Head Office Store</p>
                    <p className="max-w-[220px] break-words text-xs leading-5 text-muted-foreground">System Store</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sm">{storeItemCount}</p>
                    <p className="text-xs text-muted-foreground">assets</p>
                  </div>
                </div>
              )}
              <Link to="/offices">
                <Button variant="ghost" size="sm" className="mt-2 gap-1">
                  View all <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </WorkflowPanel>

          <WorkflowPanel title="Recent item timeline" description="A compact view of the latest item activity surfaced in the dashboard.">
            <TimelineList
              items={recentItemsTimeline}
              emptyTitle="No recent asset items"
              emptyDescription="Recent item activity will appear here once new items are added or updated."
            />
          </WorkflowPanel>
        </div>
      </div>
    </MainLayout>
  );
}
