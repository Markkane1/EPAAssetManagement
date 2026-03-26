import { lazy, Suspense, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { PageSearchProvider } from "@/contexts/PageSearchContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { API_CONFIG } from "@/config/api.config";

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Assets = lazy(() => import("./pages/Assets"));
const AssetDetail = lazy(() => import("./pages/AssetDetail"));
const AssetItems = lazy(() => import("./pages/AssetItems"));
const ConsumableMaster = lazy(() => import("./pages/consumables/ConsumableMaster"));
const ConsumableReceive = lazy(() => import("./pages/consumables/ConsumableReceive"));
const ConsumableContainers = lazy(() => import("./pages/consumables/ConsumableContainers"));
const ConsumableUnits = lazy(() => import("./pages/consumables/ConsumableUnits"));
const ConsumableInventory = lazy(() => import("./pages/consumables/ConsumableInventory"));
const ConsumableTransfers = lazy(() => import("./pages/consumables/ConsumableTransfers"));
const ConsumableAssignments = lazy(() => import("./pages/consumables/ConsumableAssignments"));
const ConsumableConsume = lazy(() => import("./pages/consumables/ConsumableConsume"));
const ConsumableAdjustments = lazy(() => import("./pages/consumables/ConsumableAdjustments"));
const ConsumableDisposal = lazy(() => import("./pages/consumables/ConsumableDisposal"));
const ConsumableReturns = lazy(() => import("./pages/consumables/ConsumableReturns"));
const ConsumableLedger = lazy(() => import("./pages/consumables/ConsumableLedger"));
const ConsumableExpiry = lazy(() => import("./pages/consumables/ConsumableExpiry"));
const Employees = lazy(() => import("./pages/Employees"));
const EmployeeDetail = lazy(() => import("./pages/EmployeeDetail"));
const Assignments = lazy(() => import("./pages/Assignments"));
const Maintenance = lazy(() => import("./pages/Maintenance"));
const Transfers = lazy(() => import("./pages/Transfers"));
const TransferDetail = lazy(() => import("./pages/TransferDetail"));
const PurchaseOrders = lazy(() => import("./pages/PurchaseOrders"));
const Offices = lazy(() => import("./pages/Offices"));
const RoomsSections = lazy(() => import("./pages/RoomsSections"));
const Categories = lazy(() => import("./pages/Categories"));
const Vendors = lazy(() => import("./pages/Vendors"));
const Projects = lazy(() => import("./pages/Projects"));
const Schemes = lazy(() => import("./pages/Schemes"));
const Reports = lazy(() => import("./pages/Reports"));
const Compliance = lazy(() => import("./pages/Compliance"));
const Requisitions = lazy(() => import("./pages/Requisitions"));
const RequisitionNew = lazy(() => import("./pages/RequisitionNew"));
const RequisitionDetail = lazy(() => import("./pages/RequisitionDetail"));
const Returns = lazy(() => import("./pages/Returns"));
const ReturnRequestNew = lazy(() => import("./pages/ReturnRequestNew"));
const ReturnDetail = lazy(() => import("./pages/ReturnDetail"));
const MyAssets = lazy(() => import("./pages/MyAssets"));
const AssetSummaryReport = lazy(() => import("./pages/reports/AssetSummaryReport"));
const AssetItemsInventoryReport = lazy(() => import("./pages/reports/AssetItemsInventoryReport"));
const AssignmentSummaryReport = lazy(() => import("./pages/reports/AssignmentSummaryReport"));
const StatusDistributionReport = lazy(() => import("./pages/reports/StatusDistributionReport"));
const MaintenanceReport = lazy(() => import("./pages/reports/MaintenanceReport"));
const LocationInventoryReport = lazy(() => import("./pages/reports/LocationInventoryReport"));
const FinancialSummaryReport = lazy(() => import("./pages/reports/FinancialSummaryReport"));
const EmployeeAssetsReport = lazy(() => import("./pages/reports/EmployeeAssetsReport"));
const Settings = lazy(() => import("./pages/Settings"));
const NotificationDetails = lazy(() => import("./pages/NotificationDetails"));
const RoleDelegations = lazy(() => import("./pages/RoleDelegations"));
const Profile = lazy(() => import("./pages/Profile"));
const Login = lazy(() => import("./pages/Login"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const AuditLogs = lazy(() => import("./pages/AuditLogs"));
const ApprovalMatrix = lazy(() => import("./pages/ApprovalMatrix"));
const UserPermissions = lazy(() => import("./pages/UserPermissions"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const UserActivity = lazy(() => import("./pages/UserActivity"));
const NotFound = lazy(() => import("./pages/NotFound"));

const RouteFallback = () => (
  <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
    Loading...
  </div>
);

const AssignmentsEntry = () => {
  const { role } = useAuth();
  if (role === "employee") {
    return <Navigate to="/my-assets" replace />;
  }
  return <Assignments />;
};

const App = () => {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: API_CONFIG.query.staleTime,
            gcTime: API_CONFIG.query.cacheTime,
            refetchOnWindowFocus: API_CONFIG.query.refetchOnWindowFocus,
            retry: API_CONFIG.query.retry,
            retryDelay: API_CONFIG.query.retryDelay,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter future={routerFuture}>
          <AuthProvider>
            <PageSearchProvider>
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/" element={<ProtectedRoute page="dashboard"><Dashboard /></ProtectedRoute>} />
                  <Route path="/assets" element={<ProtectedRoute anyOfPages={["assets", "office-assets"]}><Assets /></ProtectedRoute>} />
                  <Route path="/assets/:id" element={<ProtectedRoute anyOfPages={["assets", "office-assets"]}><AssetDetail /></ProtectedRoute>} />
                  <Route path="/asset-items" element={<ProtectedRoute anyOfPages={["asset-items", "office-asset-items"]}><AssetItems /></ProtectedRoute>} />
                  
                  {/* Office Specific Routes */}
                  <Route path="/office/assets" element={<ProtectedRoute anyOfPages={["assets", "office-assets"]}><Navigate to="/assets" replace /></ProtectedRoute>} />
                  <Route path="/office/asset-items" element={<ProtectedRoute anyOfPages={["asset-items", "office-asset-items"]}><Navigate to="/asset-items" replace /></ProtectedRoute>} />
                  <Route path="/consumables" element={<ProtectedRoute page="consumables"><ConsumableMaster /></ProtectedRoute>} />
                  <Route path="/consumables/receive" element={<ProtectedRoute anyOfPages={["consumables", "office-consumables"]}><ConsumableReceive /></ProtectedRoute>} />
                  <Route path="/office/consumables/receive" element={<ProtectedRoute anyOfPages={["consumables", "office-consumables"]}><Navigate to="/consumables/receive" replace /></ProtectedRoute>} />
                  <Route path="/consumables/containers" element={<ProtectedRoute page="consumables"><ConsumableContainers /></ProtectedRoute>} />
                  <Route path="/consumables/units" element={<ProtectedRoute page="consumables"><ConsumableUnits /></ProtectedRoute>} />
                  <Route path="/consumables/inventory" element={<ProtectedRoute page="consumables"><ConsumableInventory /></ProtectedRoute>} />
                  <Route path="/consumables/transfers" element={<ProtectedRoute page="consumables"><ConsumableTransfers /></ProtectedRoute>} />
                  <Route path="/consumables/assignments" element={<ProtectedRoute page="consumables"><ConsumableAssignments /></ProtectedRoute>} />
                  <Route path="/consumables/consume" element={<ProtectedRoute page="inventory"><ConsumableConsume /></ProtectedRoute>} />
                  <Route path="/consumables/adjustments" element={<ProtectedRoute page="consumables"><ConsumableAdjustments /></ProtectedRoute>} />
                  <Route path="/consumables/disposal" element={<ProtectedRoute page="consumables"><ConsumableDisposal /></ProtectedRoute>} />
                  <Route path="/consumables/returns" element={<ProtectedRoute page="consumables"><ConsumableReturns /></ProtectedRoute>} />
                  <Route path="/consumables/ledger" element={<ProtectedRoute page="inventory"><ConsumableLedger /></ProtectedRoute>} />
                  <Route path="/consumables/expiry" element={<ProtectedRoute page="consumables"><ConsumableExpiry /></ProtectedRoute>} />
                  <Route path="/employees" element={<ProtectedRoute page="employees"><Employees /></ProtectedRoute>} />
                  <Route path="/employees/:id" element={<ProtectedRoute page="employees"><EmployeeDetail /></ProtectedRoute>} />
                  <Route path="/assignments" element={<ProtectedRoute page="assignments"><AssignmentsEntry /></ProtectedRoute>} />
                  <Route path="/my-assets" element={<ProtectedRoute page="assignments" allowedRoles={["employee"]}><MyAssets /></ProtectedRoute>} />
                  <Route path="/transfers" element={<ProtectedRoute page="transfers"><Transfers /></ProtectedRoute>} />
                  <Route path="/transfers/:id" element={<ProtectedRoute page="transfers"><TransferDetail /></ProtectedRoute>} />
                  <Route path="/maintenance" element={<ProtectedRoute page="maintenance"><Maintenance /></ProtectedRoute>} />
                  <Route path="/purchase-orders" element={<ProtectedRoute page="purchase-orders"><PurchaseOrders /></ProtectedRoute>} />
                  <Route path="/offices" element={<ProtectedRoute page="offices"><Offices /></ProtectedRoute>} />
                  <Route path="/rooms-sections" element={<ProtectedRoute page="rooms-sections"><RoomsSections /></ProtectedRoute>} />
                  <Route path="/categories" element={<ProtectedRoute page="categories"><Categories /></ProtectedRoute>} />
                  <Route path="/vendors" element={<ProtectedRoute page="vendors"><Vendors /></ProtectedRoute>} />
                  <Route path="/projects" element={<ProtectedRoute page="projects"><Projects /></ProtectedRoute>} />
                  <Route path="/schemes" element={<ProtectedRoute page="schemes"><Schemes /></ProtectedRoute>} />
                  <Route path="/reports" element={<ProtectedRoute page="reports"><Reports /></ProtectedRoute>} />
                  <Route path="/compliance" element={<ProtectedRoute page="compliance"><Compliance /></ProtectedRoute>} />
                  <Route path="/requisitions" element={<ProtectedRoute page="requisitions"><Requisitions /></ProtectedRoute>} />
                  <Route path="/requisitions/approved" element={<ProtectedRoute page="requisitions"><Requisitions /></ProtectedRoute>} />
                  <Route path="/requisitions/new" element={<ProtectedRoute page="requisitions-new"><RequisitionNew /></ProtectedRoute>} />
                  <Route path="/requisitions/:id" element={<ProtectedRoute page="requisitions"><RequisitionDetail /></ProtectedRoute>} />
                  <Route path="/returns/new" element={<ProtectedRoute page="returns-new"><ReturnRequestNew /></ProtectedRoute>} />
                  <Route path="/returns" element={<ProtectedRoute page="returns"><Returns /></ProtectedRoute>} />
                  <Route path="/returns/:id" element={<ProtectedRoute page="returns-detail"><ReturnDetail /></ProtectedRoute>} />
                  <Route
                    path="/reports/asset-summary"
                    element={
                      <ProtectedRoute page="reports" allowedRoles={["org_admin", "office_head", "caretaker", "procurement_officer", "compliance_auditor"]}>
                        <AssetSummaryReport />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/reports/asset-items-inventory"
                    element={
                      <ProtectedRoute page="reports" allowedRoles={["org_admin", "office_head", "caretaker", "procurement_officer", "compliance_auditor"]}>
                        <AssetItemsInventoryReport />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/reports/assignment-summary" element={<ProtectedRoute page="reports"><AssignmentSummaryReport /></ProtectedRoute>} />
                  <Route
                    path="/reports/status-distribution"
                    element={
                      <ProtectedRoute page="reports" allowedRoles={["org_admin", "office_head", "caretaker", "procurement_officer", "compliance_auditor"]}>
                        <StatusDistributionReport />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/reports/maintenance-report"
                    element={
                      <ProtectedRoute page="reports" allowedRoles={["org_admin", "office_head", "caretaker", "procurement_officer", "compliance_auditor"]}>
                        <MaintenanceReport />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/reports/location-inventory"
                    element={
                      <ProtectedRoute page="reports" allowedRoles={["org_admin", "office_head", "caretaker", "procurement_officer", "compliance_auditor"]}>
                        <LocationInventoryReport />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/reports/financial-summary"
                    element={
                      <ProtectedRoute page="reports" allowedRoles={["org_admin", "office_head", "caretaker", "procurement_officer", "compliance_auditor"]}>
                        <FinancialSummaryReport />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/reports/employee-assets" element={<ProtectedRoute page="reports"><EmployeeAssetsReport /></ProtectedRoute>} />
                  <Route path="/settings" element={<ProtectedRoute page="settings" allowedRoles={["org_admin", "office_head"]}><Settings /></ProtectedRoute>} />
                  <Route path="/settings/notifications" element={<ProtectedRoute page="profile"><NotificationDetails /></ProtectedRoute>} />
                  <Route path="/settings/delegations" element={<ProtectedRoute page="profile" allowedRoles={["org_admin", "office_head", "caretaker"]}><RoleDelegations /></ProtectedRoute>} />
                  <Route path="/audit-logs" element={<ProtectedRoute page="audit-logs"><AuditLogs /></ProtectedRoute>} />
                  <Route path="/approval-matrix" element={<ProtectedRoute page="approval-matrix"><ApprovalMatrix /></ProtectedRoute>} />
                  <Route path="/user-permissions" element={<ProtectedRoute page="user-permissions"><UserPermissions /></ProtectedRoute>} />
                  <Route path="/user-management" element={<ProtectedRoute page="user-management"><UserManagement /></ProtectedRoute>} />
                  <Route path="/user-activity" element={<ProtectedRoute page="user-activity"><UserActivity /></ProtectedRoute>} />
                  <Route path="/profile" element={<ProtectedRoute page="profile"><Profile /></ProtectedRoute>} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </PageSearchProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
