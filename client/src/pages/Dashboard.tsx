import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { AssetsByCategory } from "@/components/dashboard/AssetsByCategory";
import { AssetStatusChart } from "@/components/dashboard/AssetStatusChart";
import { PendingPurchaseOrders } from "@/components/dashboard/PendingPurchaseOrders";
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
import { useDashboardStats } from "@/hooks/useDashboard";
import { useAssetItems } from "@/hooks/useAssetItems";
import { useLocations } from "@/hooks/useLocations";
import { useAssignmentsByEmployee } from "@/hooks/useAssignments";
import { useEmployees } from "@/hooks/useEmployees";
import { useAuth } from "@/contexts/AuthContext";
import { usePageSearch } from "@/contexts/PageSearchContext";
import { getOfficeHolderId, isStoreHolder } from "@/lib/assetItemHolder";
import { requisitionService } from "@/services/requisitionService";
import { returnRequestService } from "@/services/returnRequestService";
import { consumableInventoryService } from "@/services/consumableInventoryService";

function safeId(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

const OPEN_REQUISITION_STATUSES = new Set([
  "SUBMITTED",
  "PENDING_VERIFICATION",
  "APPROVED",
  "VERIFIED_APPROVED",
  "IN_FULFILLMENT",
  "PARTIALLY_FULFILLED",
]);

export default function Dashboard() {
  const { role, user } = useAuth();
  const isEmployee = role === "employee";
  const loadAdminCollections = !isEmployee;
  const { data: dashboardStats, isLoading: statsLoading } = useDashboardStats({
    enabled: loadAdminCollections,
  });
  const { data: assetItems } = useAssetItems({ enabled: loadAdminCollections });
  const { data: locations } = useLocations({ enabled: loadAdminCollections });
  const { data: employees, isLoading: employeesLoading } = useEmployees();
  const pageSearch = usePageSearch();
  const searchTerm = (pageSearch?.term || "").trim().toLowerCase();

  const employeeList = useMemo(() => employees || [], [employees]);
  const currentEmployee = useMemo(() => {
    const userId = safeId(user?.id);
    const userEmail = String(user?.email || "").toLowerCase();
    return (
      employeeList.find((entry) => safeId((entry as Record<string, unknown>).user_id) === userId) ||
      employeeList.find((entry) => String((entry as Record<string, unknown>).email || "").toLowerCase() === userEmail) ||
      null
    );
  }, [employeeList, user?.email, user?.id]);
  const currentEmployeeId = safeId((currentEmployee as Record<string, unknown> | null)?._id) || safeId((currentEmployee as Record<string, unknown> | null)?.id);

  const employeeRequisitionsQuery = useQuery({
    queryKey: ["dashboard", "employee", "requisitions"],
    queryFn: () => requisitionService.list({ limit: 200 }),
    enabled: isEmployee,
  });
  const employeeReturnRequestsQuery = useQuery({
    queryKey: ["dashboard", "employee", "returns", currentEmployeeId || "unmapped"],
    queryFn: () => returnRequestService.list({ limit: 200 }),
    enabled: isEmployee && Boolean(currentEmployeeId),
  });

  const { data: employeeAssignmentData, isLoading: employeeAssignmentsLoading } = useAssignmentsByEmployee(currentEmployeeId || "");

  const employeeConsumableBalancesQuery = useQuery({
    queryKey: ["dashboard", "employee", "consumable-balances", currentEmployeeId],
    queryFn: () =>
      consumableInventoryService.getBalances({
        holderType: "EMPLOYEE",
        holderId: String(currentEmployeeId),
      }),
    enabled: isEmployee && Boolean(currentEmployeeId),
  });

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

  const employeeRequisitions = useMemo(
    () => employeeRequisitionsQuery.data?.data || [],
    [employeeRequisitionsQuery.data]
  );
  const employeeOpenRequisitionsCount = useMemo(
    () =>
      employeeRequisitions.filter((row) =>
        OPEN_REQUISITION_STATUSES.has(String((row as Record<string, unknown>).status || "").toUpperCase())
      ).length,
    [employeeRequisitions]
  );

  const employeeReturnRequests = useMemo(
    () => employeeReturnRequestsQuery.data?.data || [],
    [employeeReturnRequestsQuery.data]
  );
  const employeeOpenReturnsCount = useMemo(
    () =>
      employeeReturnRequests.filter((row) => {
        const status = String((row as Record<string, unknown>).status || "").toUpperCase();
        return status === "SUBMITTED" || status === "RECEIVED_CONFIRMED";
      }).length,
    [employeeReturnRequests]
  );

  const employeeLoading =
    isEmployee &&
    (employeesLoading ||
      employeeAssignmentsLoading ||
      employeeRequisitionsQuery.isLoading ||
      employeeReturnRequestsQuery.isLoading ||
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
  const assetItemList = useMemo(() => assetItems || [], [assetItems]);
  const locationList = useMemo(() => locations || [], [locations]);

  const recentItems = useMemo(
    () =>
      assetItemList
        .filter((item) => {
          if (!searchTerm) return true;
          return [item.tag, item.serial_number, item.item_status, item.item_condition]
            .join(" ")
            .toLowerCase()
            .includes(searchTerm);
        })
        .slice(0, 5),
    [assetItemList, searchTerm]
  );
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
  const showStoreRow =
    !searchTerm || "head office store system store".toLowerCase().includes(searchTerm);
  const visibleLocations = useMemo(
    () =>
      locationList
        .filter((location) => {
          if (!searchTerm) return true;
          return [location.name, location.address].join(" ").toLowerCase().includes(searchTerm);
        })
        .slice(0, 5),
    [locationList, searchTerm]
  );

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
    return (
      <MainLayout title="Dashboard" description="Overview of your services and assigned assets">
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            </CardContent>
          </Card>

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

      <div className="mb-8">
        <PendingPurchaseOrders />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
              {visibleLocations.map((location, index) => {
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
              {showStoreRow && (
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
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
