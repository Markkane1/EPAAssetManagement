import { useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import Assets from "./pages/Assets";
import AssetDetail from "./pages/AssetDetail";
import AssetItems from "./pages/AssetItems";
import ConsumableMaster from "./pages/consumables/ConsumableMaster";
import ConsumableLocations from "./pages/consumables/ConsumableLocations";
import ConsumableReceive from "./pages/consumables/ConsumableReceive";
import ConsumableInventory from "./pages/consumables/ConsumableInventory";
import ConsumableTransfers from "./pages/consumables/ConsumableTransfers";
import ConsumableConsume from "./pages/consumables/ConsumableConsume";
import ConsumableAdjustments from "./pages/consumables/ConsumableAdjustments";
import ConsumableDisposal from "./pages/consumables/ConsumableDisposal";
import ConsumableReturns from "./pages/consumables/ConsumableReturns";
import ConsumableLedger from "./pages/consumables/ConsumableLedger";
import ConsumableExpiry from "./pages/consumables/ConsumableExpiry";
import ConsumableAssignments from "./pages/ConsumableAssignments";
import Employees from "./pages/Employees";
import EmployeeDetail from "./pages/EmployeeDetail";
import Assignments from "./pages/Assignments";
import Maintenance from "./pages/Maintenance";
import Transfers from "./pages/Transfers";
import PurchaseOrders from "./pages/PurchaseOrders";
import Offices from "./pages/Offices";
import Categories from "./pages/Categories";
import Vendors from "./pages/Vendors";
import Projects from "./pages/Projects";
import Schemes from "./pages/Schemes";
import Reports from "./pages/Reports";
import InventoryHub from "./pages/InventoryHub";
import AssetSummaryReport from "./pages/reports/AssetSummaryReport";
import AssetItemsInventoryReport from "./pages/reports/AssetItemsInventoryReport";
import AssignmentSummaryReport from "./pages/reports/AssignmentSummaryReport";
import StatusDistributionReport from "./pages/reports/StatusDistributionReport";
import MaintenanceReport from "./pages/reports/MaintenanceReport";
import LocationInventoryReport from "./pages/reports/LocationInventoryReport";
import FinancialSummaryReport from "./pages/reports/FinancialSummaryReport";
import EmployeeAssetsReport from "./pages/reports/EmployeeAssetsReport";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import AuditLogs from "./pages/AuditLogs";
import UserPermissions from "./pages/UserPermissions";
import UserManagement from "./pages/UserManagement";
import UserActivity from "./pages/UserActivity";
import NotFound from "./pages/NotFound";
import type { AppRole } from "@/services/authService";

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

const App = () => {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
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
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
