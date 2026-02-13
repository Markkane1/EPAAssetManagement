import { lazy, Suspense, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import type { AppRole } from "@/services/authService";
import { API_CONFIG } from "@/config/api.config";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Assets = lazy(() => import("./pages/Assets"));
const AssetDetail = lazy(() => import("./pages/AssetDetail"));
const AssetItems = lazy(() => import("./pages/AssetItems"));
const ConsumableMaster = lazy(() => import("./pages/consumables/ConsumableMaster"));
const ConsumableLocations = lazy(() => import("./pages/consumables/ConsumableLocations"));
const ConsumableReceive = lazy(() => import("./pages/consumables/ConsumableReceive"));
const ConsumableLots = lazy(() => import("./pages/consumables/ConsumableLots"));
const ConsumableUnits = lazy(() => import("./pages/consumables/ConsumableUnits"));
const ConsumableInventory = lazy(() => import("./pages/consumables/ConsumableInventory"));
const ConsumableTransfers = lazy(() => import("./pages/consumables/ConsumableTransfers"));
const ConsumableConsume = lazy(() => import("./pages/consumables/ConsumableConsume"));
const ConsumableAdjustments = lazy(() => import("./pages/consumables/ConsumableAdjustments"));
const ConsumableDisposal = lazy(() => import("./pages/consumables/ConsumableDisposal"));
const ConsumableReturns = lazy(() => import("./pages/consumables/ConsumableReturns"));
const ConsumableLedger = lazy(() => import("./pages/consumables/ConsumableLedger"));
const ConsumableExpiry = lazy(() => import("./pages/consumables/ConsumableExpiry"));
const ConsumableAssignments = lazy(() => import("./pages/ConsumableAssignments"));
const Employees = lazy(() => import("./pages/Employees"));
const EmployeeDetail = lazy(() => import("./pages/EmployeeDetail"));
const Assignments = lazy(() => import("./pages/Assignments"));
const Maintenance = lazy(() => import("./pages/Maintenance"));
const Transfers = lazy(() => import("./pages/Transfers"));
const PurchaseOrders = lazy(() => import("./pages/PurchaseOrders"));
const Offices = lazy(() => import("./pages/Offices"));
const Categories = lazy(() => import("./pages/Categories"));
const Vendors = lazy(() => import("./pages/Vendors"));
const Projects = lazy(() => import("./pages/Projects"));
const Schemes = lazy(() => import("./pages/Schemes"));
const Reports = lazy(() => import("./pages/Reports"));
const InventoryHub = lazy(() => import("./pages/InventoryHub"));
const AssetSummaryReport = lazy(() => import("./pages/reports/AssetSummaryReport"));
const AssetItemsInventoryReport = lazy(() => import("./pages/reports/AssetItemsInventoryReport"));
const AssignmentSummaryReport = lazy(() => import("./pages/reports/AssignmentSummaryReport"));
const StatusDistributionReport = lazy(() => import("./pages/reports/StatusDistributionReport"));
const MaintenanceReport = lazy(() => import("./pages/reports/MaintenanceReport"));
const LocationInventoryReport = lazy(() => import("./pages/reports/LocationInventoryReport"));
const FinancialSummaryReport = lazy(() => import("./pages/reports/FinancialSummaryReport"));
const EmployeeAssetsReport = lazy(() => import("./pages/reports/EmployeeAssetsReport"));
const Settings = lazy(() => import("./pages/Settings"));
const Profile = lazy(() => import("./pages/Profile"));
const Login = lazy(() => import("./pages/Login"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const AuditLogs = lazy(() => import("./pages/AuditLogs"));
const UserPermissions = lazy(() => import("./pages/UserPermissions"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const UserActivity = lazy(() => import("./pages/UserActivity"));
const NotFound = lazy(() => import("./pages/NotFound"));

const fullAccessRoles: AppRole[] = ["super_admin", "admin", "user", "viewer"];
const assignmentAccessRoles: AppRole[] = [...fullAccessRoles, "employee", "directorate_head"];
const consumableAccessRoles: AppRole[] = [
  ...fullAccessRoles,
  "directorate_head",
  "central_store_admin",
  "lab_manager",
  "lab_user",
  "auditor",
];
const adminAccessRoles: AppRole[] = ["super_admin", "admin"];

const RouteFallback = () => (
  <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
    Loading...
  </div>
);

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
        <BrowserRouter>
          <AuthProvider>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/" element={<ProtectedRoute allowedRoles={fullAccessRoles}><Dashboard /></ProtectedRoute>} />
                <Route path="/assets" element={<ProtectedRoute allowedRoles={fullAccessRoles}><Assets /></ProtectedRoute>} />
                <Route path="/assets/:id" element={<ProtectedRoute allowedRoles={fullAccessRoles}><AssetDetail /></ProtectedRoute>} />
                <Route path="/asset-items" element={<ProtectedRoute allowedRoles={fullAccessRoles}><AssetItems /></ProtectedRoute>} />
                <Route path="/consumables" element={<ProtectedRoute allowedRoles={consumableAccessRoles}><ConsumableMaster /></ProtectedRoute>} />
                <Route path="/consumables/locations" element={<ProtectedRoute allowedRoles={consumableAccessRoles}><ConsumableLocations /></ProtectedRoute>} />
                <Route path="/consumables/receive" element={<ProtectedRoute allowedRoles={consumableAccessRoles}><ConsumableReceive /></ProtectedRoute>} />
                <Route path="/consumables/lots" element={<ProtectedRoute allowedRoles={consumableAccessRoles}><ConsumableLots /></ProtectedRoute>} />
                <Route path="/consumables/units" element={<ProtectedRoute allowedRoles={consumableAccessRoles}><ConsumableUnits /></ProtectedRoute>} />
                <Route path="/consumables/inventory" element={<ProtectedRoute allowedRoles={consumableAccessRoles}><ConsumableInventory /></ProtectedRoute>} />
                <Route path="/consumables/transfers" element={<ProtectedRoute allowedRoles={consumableAccessRoles}><ConsumableTransfers /></ProtectedRoute>} />
                <Route path="/consumables/consume" element={<ProtectedRoute allowedRoles={consumableAccessRoles}><ConsumableConsume /></ProtectedRoute>} />
                <Route path="/consumables/adjustments" element={<ProtectedRoute allowedRoles={consumableAccessRoles}><ConsumableAdjustments /></ProtectedRoute>} />
                <Route path="/consumables/disposal" element={<ProtectedRoute allowedRoles={consumableAccessRoles}><ConsumableDisposal /></ProtectedRoute>} />
                <Route path="/consumables/returns" element={<ProtectedRoute allowedRoles={consumableAccessRoles}><ConsumableReturns /></ProtectedRoute>} />
                <Route path="/consumables/ledger" element={<ProtectedRoute allowedRoles={consumableAccessRoles}><ConsumableLedger /></ProtectedRoute>} />
                <Route path="/consumables/expiry" element={<ProtectedRoute allowedRoles={consumableAccessRoles}><ConsumableExpiry /></ProtectedRoute>} />
                <Route path="/consumable-assignments" element={<ProtectedRoute allowedRoles={consumableAccessRoles}><ConsumableAssignments /></ProtectedRoute>} />
                <Route path="/consumable-transfers" element={<ProtectedRoute allowedRoles={consumableAccessRoles}><ConsumableAssignments /></ProtectedRoute>} />
                <Route path="/employees" element={<ProtectedRoute allowedRoles={fullAccessRoles}><Employees /></ProtectedRoute>} />
                <Route path="/employees/:id" element={<ProtectedRoute allowedRoles={fullAccessRoles}><EmployeeDetail /></ProtectedRoute>} />
                <Route path="/assignments" element={<ProtectedRoute allowedRoles={assignmentAccessRoles}><Assignments /></ProtectedRoute>} />
                <Route path="/transfers" element={<ProtectedRoute allowedRoles={fullAccessRoles}><Transfers /></ProtectedRoute>} />
                <Route path="/maintenance" element={<ProtectedRoute allowedRoles={fullAccessRoles}><Maintenance /></ProtectedRoute>} />
                <Route path="/purchase-orders" element={<ProtectedRoute allowedRoles={fullAccessRoles}><PurchaseOrders /></ProtectedRoute>} />
                <Route path="/offices" element={<ProtectedRoute allowedRoles={adminAccessRoles}><Offices /></ProtectedRoute>} />
                <Route path="/categories" element={<ProtectedRoute allowedRoles={fullAccessRoles}><Categories /></ProtectedRoute>} />
                <Route path="/vendors" element={<ProtectedRoute allowedRoles={fullAccessRoles}><Vendors /></ProtectedRoute>} />
                <Route path="/projects" element={<ProtectedRoute allowedRoles={fullAccessRoles}><Projects /></ProtectedRoute>} />
                <Route path="/schemes" element={<ProtectedRoute allowedRoles={fullAccessRoles}><Schemes /></ProtectedRoute>} />
                <Route path="/reports" element={<ProtectedRoute allowedRoles={fullAccessRoles}><Reports /></ProtectedRoute>} />
                <Route path="/inventory" element={<ProtectedRoute allowedRoles={fullAccessRoles}><InventoryHub /></ProtectedRoute>} />
                <Route path="/reports/asset-summary" element={<ProtectedRoute allowedRoles={fullAccessRoles}><AssetSummaryReport /></ProtectedRoute>} />
                <Route path="/reports/asset-items-inventory" element={<ProtectedRoute allowedRoles={fullAccessRoles}><AssetItemsInventoryReport /></ProtectedRoute>} />
                <Route path="/reports/assignment-summary" element={<ProtectedRoute allowedRoles={fullAccessRoles}><AssignmentSummaryReport /></ProtectedRoute>} />
                <Route path="/reports/status-distribution" element={<ProtectedRoute allowedRoles={fullAccessRoles}><StatusDistributionReport /></ProtectedRoute>} />
                <Route path="/reports/maintenance-report" element={<ProtectedRoute allowedRoles={fullAccessRoles}><MaintenanceReport /></ProtectedRoute>} />
                <Route path="/reports/location-inventory" element={<ProtectedRoute allowedRoles={fullAccessRoles}><LocationInventoryReport /></ProtectedRoute>} />
                <Route path="/reports/financial-summary" element={<ProtectedRoute allowedRoles={fullAccessRoles}><FinancialSummaryReport /></ProtectedRoute>} />
                <Route path="/reports/employee-assets" element={<ProtectedRoute allowedRoles={fullAccessRoles}><EmployeeAssetsReport /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute allowedRoles={fullAccessRoles}><Settings /></ProtectedRoute>} />
                <Route path="/audit-logs" element={<ProtectedRoute allowedRoles={fullAccessRoles}><AuditLogs /></ProtectedRoute>} />
                <Route path="/user-permissions" element={<ProtectedRoute allowedRoles={adminAccessRoles}><UserPermissions /></ProtectedRoute>} />
                <Route path="/user-management" element={<ProtectedRoute allowedRoles={adminAccessRoles}><UserManagement /></ProtectedRoute>} />
                <Route path="/user-activity" element={<ProtectedRoute allowedRoles={adminAccessRoles}><UserActivity /></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute allowedRoles={assignmentAccessRoles}><Profile /></ProtectedRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
