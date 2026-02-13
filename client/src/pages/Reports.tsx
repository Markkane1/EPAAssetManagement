import { useCallback, useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Download, 
  PieChart, 
  DollarSign,
  Package,
  Users,
  MapPin,
  Wrench,
  Loader2,
  FileText,
  ClipboardList,
  FileDown
} from "lucide-react";
import { toast } from "sonner";
import { useAssets } from "@/hooks/useAssets";
import { useAssetItems } from "@/hooks/useAssetItems";
import { useLocations } from "@/hooks/useLocations";
import { useCategories } from "@/hooks/useCategories";
import { useEmployees } from "@/hooks/useEmployees";
import { useAssignments } from "@/hooks/useAssignments";
import { useMaintenance } from "@/hooks/useMaintenance";
import { useDirectorates } from "@/hooks/useDirectorates";
import { exportToCSV, formatDateForExport, formatCurrencyForExport } from "@/lib/exportUtils";
import { isHeadOfficeLocation } from "@/lib/locationUtils";
import { DateRangeFilter } from "@/components/reports/DateRangeFilter";
import { filterByDateRange, generateReportPDF, getDateRangeText } from "@/lib/reporting";

interface ReportCard {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  category: string;
}

const reports: ReportCard[] = [
  {
    id: "asset-summary",
    title: "Asset Summary Report",
    description: "Aggregated views of assets by location and category",
    icon: Package,
    category: "Assets",
  },
  {
    id: "asset-items-inventory",
    title: "Asset Items Inventory",
    description: "Complete inventory of all asset items with status",
    icon: ClipboardList,
    category: "Assets",
  },
  {
    id: "assignment-summary",
    title: "Assignment Summary",
    description: "Total assignments by employee and directorate",
    icon: Users,
    category: "Assignments",
  },
  {
    id: "status-report",
    title: "Status Distribution",
    description: "Distribution of items by functional status",
    icon: PieChart,
    category: "Assets",
  },
  {
    id: "maintenance-report",
    title: "Maintenance Report",
    description: "All maintenance records with costs and status",
    icon: Wrench,
    category: "Maintenance",
  },
  {
    id: "location-inventory",
    title: "Location Inventory",
    description: "Detailed inventory by physical location",
    icon: MapPin,
    category: "Inventory",
  },
  {
    id: "financial-summary",
    title: "Financial Summary",
    description: "Total asset value and acquisition costs",
    icon: DollarSign,
    category: "Financial",
  },
  {
    id: "employee-assets",
    title: "Employee Assets Report",
    description: "Assets assigned to each employee",
    icon: FileText,
    category: "Assignments",
  },
];

const categoryColors: Record<string, string> = {
  Assets: "bg-primary/10 text-primary",
  Assignments: "bg-info/10 text-info",
  Financial: "bg-success/10 text-success",
  Maintenance: "bg-warning/10 text-warning",
  Inventory: "bg-accent text-accent-foreground",
};

export default function Reports() {
  const [generatingReport, setGeneratingReport] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  
  const { data: assets } = useAssets();
  const { data: assetItems } = useAssetItems();
  const { data: locations } = useLocations();
  const { data: categories } = useCategories();
  const { data: employees } = useEmployees();
  const { data: assignments } = useAssignments();
  const { data: maintenance } = useMaintenance();
  const { data: directorates } = useDirectorates();

  const categoryById = useMemo(
    () => new Map((categories || []).map((category) => [category.id, category])),
    [categories]
  );
  const assetById = useMemo(
    () => new Map((assets || []).map((asset) => [asset.id, asset])),
    [assets]
  );
  const assetItemsById = useMemo(
    () => new Map((assetItems || []).map((item) => [item.id, item])),
    [assetItems]
  );
  const assetItemsByAssetId = useMemo(() => {
    const map = new Map<string, number>();
    (assetItems || []).forEach((item) => {
      map.set(item.asset_id, (map.get(item.asset_id) || 0) + 1);
    });
    return map;
  }, [assetItems]);
  const assetItemsByLocationId = useMemo(() => {
    const map = new Map<string, any[]>();
    (assetItems || []).forEach((item) => {
      const existing = map.get(item.location_id) || [];
      map.set(item.location_id, [...existing, item]);
    });
    return map;
  }, [assetItems]);
  const locationById = useMemo(
    () => new Map((locations || []).map((location) => [location.id, location])),
    [locations]
  );
  const employeeById = useMemo(
    () => new Map((employees || []).map((employee) => [employee.id, employee])),
    [employees]
  );
  const directorateById = useMemo(
    () => new Map((directorates || []).map((directorate) => [directorate.id, directorate])),
    [directorates]
  );

  const getDirectorateName = useCallback((employeeId?: string) => {
    const employee = employeeId ? employeeById.get(employeeId) : undefined;
    if (!employee) return "N/A";
    const location = locationById.get(employee.location_id);
    if (!isHeadOfficeLocation(location)) return "N/A";
    const directorate = employee.directorate_id ? directorateById.get(employee.directorate_id) : undefined;
    return directorate?.name || "N/A";
  }, [directorateById, employeeById, locationById]);

  const handleGenerateReport = async (reportId: string, reportTitle: string, exportType: "csv" | "pdf") => {
    setGeneratingReport(`${reportId}-${exportType}`);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 500));

      switch (reportId) {
        case "asset-summary":
          generateAssetSummaryReport(exportType);
          break;
        case "asset-items-inventory":
          generateAssetItemsInventoryReport(exportType);
          break;
        case "assignment-summary":
          generateAssignmentSummaryReport(exportType);
          break;
        case "status-report":
          generateStatusDistributionReport(exportType);
          break;
        case "maintenance-report":
          generateMaintenanceReport(exportType);
          break;
        case "location-inventory":
          generateLocationInventoryReport(exportType);
          break;
        case "financial-summary":
          generateFinancialSummaryReport(exportType);
          break;
        case "employee-assets":
          generateEmployeeAssetsReport(exportType);
          break;
        default:
          toast.error("Report not available");
      }
      
      toast.success(`${reportTitle} generated!`, {
        description: `Your ${exportType.toUpperCase()} report has been downloaded.`,
      });
    } catch (error) {
      toast.error("Failed to generate report");
    } finally {
      setGeneratingReport(null);
    }
  };

  const generateAssetSummaryReport = (exportType: "csv" | "pdf") => {
    const filteredAssets = filterByDateRange(assets, "acquisition_date", startDate, endDate);
    if (!filteredAssets || filteredAssets.length === 0) {
      toast.error("No asset data available for selected date range");
      return;
    }

    const reportData = filteredAssets.map(asset => {
      const category = categoryById.get(asset.category_id || "");
      const itemCount = assetItemsByAssetId.get(asset.id) || 0;
      
      return {
        name: asset.name,
        description: asset.description || "",
        category: category?.name || "Uncategorized",
        quantity: asset.quantity || 0,
        itemCount,
        unitPrice: asset.unit_price || 0,
        totalValue: (asset.unit_price || 0) * (asset.quantity || 0),
        acquisitionDate: asset.acquisition_date,
        status: asset.is_active ? "Active" : "Inactive",
      };
    });

    const filename = `asset-summary-${new Date().toISOString().split('T')[0]}`;

    if (exportType === "csv") {
      exportToCSV(reportData, [
        { key: "name", header: "Asset Name" },
        { key: "description", header: "Description" },
        { key: "category", header: "Category" },
        { key: "quantity", header: "Quantity" },
        { key: "itemCount", header: "Items Registered" },
        { key: "unitPrice", header: "Unit Price", formatter: (v) => formatCurrencyForExport(v as number) },
        { key: "totalValue", header: "Total Value", formatter: (v) => formatCurrencyForExport(v as number) },
        { key: "acquisitionDate", header: "Acquisition Date", formatter: (v) => formatDateForExport(v as string) },
        { key: "status", header: "Status" },
      ], filename);
    } else {
      generateReportPDF({
        title: "Asset Summary Report",
        headers: ["Name", "Category", "Qty", "Items", "Unit Price", "Total Value", "Acq. Date", "Status"],
        data: reportData.map(r => [
          r.name,
          r.category,
          r.quantity,
          r.itemCount,
          formatCurrencyForExport(r.unitPrice),
          formatCurrencyForExport(r.totalValue),
          formatDateForExport(r.acquisitionDate),
          r.status,
        ]),
        filename,
        dateRangeText: getDateRangeText(startDate, endDate),
      });
    }
  };

  const generateAssetItemsInventoryReport = (exportType: "csv" | "pdf") => {
    const filteredItems = filterByDateRange(assetItems, "created_at", startDate, endDate);
    if (!filteredItems || filteredItems.length === 0) {
      toast.error("No asset items data available for selected date range");
      return;
    }

    const reportData = filteredItems.map(item => {
      const asset = assetById.get(item.asset_id);
      const location = locationById.get(item.location_id);
      
      return {
        tag: item.tag || "N/A",
        assetName: asset?.name || "Unknown",
        serialNumber: item.serial_number || "N/A",
        location: location?.name || "Unassigned",
        status: item.item_status || "Unknown",
        condition: item.item_condition || "Unknown",
        assignmentStatus: item.assignment_status || "Unknown",
        source: item.item_source || "Unknown",
        purchaseDate: item.purchase_date,
        warrantyExpiry: item.warranty_expiry,
      };
    });

    const filename = `asset-items-inventory-${new Date().toISOString().split('T')[0]}`;

    if (exportType === "csv") {
      exportToCSV(reportData, [
        { key: "tag", header: "Asset Tag" },
        { key: "assetName", header: "Asset Name" },
        { key: "serialNumber", header: "Serial Number" },
        { key: "location", header: "Location" },
        { key: "status", header: "Status" },
        { key: "condition", header: "Condition" },
        { key: "assignmentStatus", header: "Assignment Status" },
        { key: "source", header: "Source" },
        { key: "purchaseDate", header: "Purchase Date", formatter: (v) => formatDateForExport(v as string) },
        { key: "warrantyExpiry", header: "Warranty Expiry", formatter: (v) => formatDateForExport(v as string) },
      ], filename);
    } else {
      generateReportPDF({
        title: "Asset Items Inventory Report",
        headers: ["Tag", "Asset", "Serial #", "Location", "Status", "Condition", "Assignment"],
        data: reportData.map(r => [
          r.tag,
          r.assetName,
          r.serialNumber,
          r.location,
          r.status,
          r.condition,
          r.assignmentStatus,
        ]),
        filename,
        dateRangeText: getDateRangeText(startDate, endDate),
      });
    }
  };

  const generateAssignmentSummaryReport = (exportType: "csv" | "pdf") => {
    const filteredAssignments = filterByDateRange(assignments, "assigned_date", startDate, endDate);
    if (!filteredAssignments || filteredAssignments.length === 0) {
      toast.error("No assignment data available for selected date range");
      return;
    }

    const reportData = filteredAssignments.map(assignment => {
      const employee = employeeById.get(assignment.employee_id || "");
      const assetItem = assetItemsById.get(assignment.asset_item_id || "");
      const asset = assetItem ? assetById.get(assetItem.asset_id) : null;
      
      return {
        employeeName: employee ? `${employee.first_name} ${employee.last_name}` : "Unknown",
        employeeEmail: employee?.email || "",
        directorate: getDirectorateName(employee?.id),
        assetTag: assetItem?.tag || "N/A",
        assetName: asset?.name || "Unknown",
        assignedDate: assignment.assigned_date,
        expectedReturnDate: assignment.expected_return_date,
        returnedDate: assignment.returned_date,
        status: assignment.is_active ? "Active" : "Returned",
        notes: assignment.notes || "",
      };
    });

    const filename = `assignment-summary-${new Date().toISOString().split('T')[0]}`;

    if (exportType === "csv") {
      exportToCSV(reportData, [
        { key: "employeeName", header: "Employee Name" },
        { key: "employeeEmail", header: "Email" },
        { key: "directorate", header: "Directorate" },
        { key: "assetTag", header: "Asset Tag" },
        { key: "assetName", header: "Asset Name" },
        { key: "assignedDate", header: "Assigned Date", formatter: (v) => formatDateForExport(v as string) },
        { key: "expectedReturnDate", header: "Expected Return", formatter: (v) => formatDateForExport(v as string) },
        { key: "returnedDate", header: "Returned Date", formatter: (v) => formatDateForExport(v as string) },
        { key: "status", header: "Status" },
        { key: "notes", header: "Notes" },
      ], filename);
    } else {
      generateReportPDF({
        title: "Assignment Summary Report",
        headers: ["Employee", "Directorate", "Asset Tag", "Asset", "Assigned", "Expected Return", "Status"],
        data: reportData.map(r => [
          r.employeeName,
          r.directorate,
          r.assetTag,
          r.assetName,
          formatDateForExport(r.assignedDate),
          formatDateForExport(r.expectedReturnDate),
          r.status,
        ]),
        filename,
        dateRangeText: getDateRangeText(startDate, endDate),
      });
    }
  };

  const generateStatusDistributionReport = (exportType: "csv" | "pdf") => {
    const filteredItems = filterByDateRange(assetItems, "created_at", startDate, endDate);
    if (!filteredItems || filteredItems.length === 0) {
      toast.error("No asset items data available for selected date range");
      return;
    }

    const statusCounts: Record<string, number> = {};
    const conditionCounts: Record<string, number> = {};
    const assignmentCounts: Record<string, number> = {};

    filteredItems.forEach(item => {
      const status = item.item_status || "Unknown";
      const condition = item.item_condition || "Unknown";
      const assignment = item.assignment_status || "Unknown";

      statusCounts[status] = (statusCounts[status] || 0) + 1;
      conditionCounts[condition] = (conditionCounts[condition] || 0) + 1;
      assignmentCounts[assignment] = (assignmentCounts[assignment] || 0) + 1;
    });

    const filename = `status-distribution-${new Date().toISOString().split('T')[0]}`;

    if (exportType === "csv") {
      const reportData = [
        { category: "--- STATUS DISTRIBUTION ---", type: "", count: "", percentage: "" },
        ...Object.entries(statusCounts).map(([type, count]) => ({
          category: "Status",
          type,
          count: count.toString(),
          percentage: ((count / filteredItems.length) * 100).toFixed(1) + "%",
        })),
        { category: "--- CONDITION DISTRIBUTION ---", type: "", count: "", percentage: "" },
        ...Object.entries(conditionCounts).map(([type, count]) => ({
          category: "Condition",
          type,
          count: count.toString(),
          percentage: ((count / filteredItems.length) * 100).toFixed(1) + "%",
        })),
        { category: "--- ASSIGNMENT DISTRIBUTION ---", type: "", count: "", percentage: "" },
        ...Object.entries(assignmentCounts).map(([type, count]) => ({
          category: "Assignment",
          type,
          count: count.toString(),
          percentage: ((count / filteredItems.length) * 100).toFixed(1) + "%",
        })),
      ];

      exportToCSV(reportData, [
        { key: "category", header: "Category" },
        { key: "type", header: "Type" },
        { key: "count", header: "Count" },
        { key: "percentage", header: "Percentage" },
      ], filename);
    } else {
      const pdfData: (string | number)[][] = [];
      
      pdfData.push(["STATUS DISTRIBUTION", "", "", ""]);
      Object.entries(statusCounts).forEach(([type, count]) => {
        pdfData.push(["Status", type, count, ((count / filteredItems.length) * 100).toFixed(1) + "%"]);
      });
      
      pdfData.push(["CONDITION DISTRIBUTION", "", "", ""]);
      Object.entries(conditionCounts).forEach(([type, count]) => {
        pdfData.push(["Condition", type, count, ((count / filteredItems.length) * 100).toFixed(1) + "%"]);
      });
      
      pdfData.push(["ASSIGNMENT DISTRIBUTION", "", "", ""]);
      Object.entries(assignmentCounts).forEach(([type, count]) => {
        pdfData.push(["Assignment", type, count, ((count / filteredItems.length) * 100).toFixed(1) + "%"]);
      });

      generateReportPDF({
        title: "Status Distribution Report",
        headers: ["Category", "Type", "Count", "Percentage"],
        data: pdfData,
        filename,
        dateRangeText: getDateRangeText(startDate, endDate),
      });
    }
  };

  const generateMaintenanceReport = (exportType: "csv" | "pdf") => {
    const filteredMaintenance = filterByDateRange(maintenance, "scheduled_date", startDate, endDate);
    if (!filteredMaintenance || filteredMaintenance.length === 0) {
      toast.error("No maintenance data available for selected date range");
      return;
    }

    const reportData = filteredMaintenance.map(record => {
      const assetItem = assetItemsById.get(record.asset_item_id || "");
      const asset = assetItem ? assetById.get(assetItem.asset_id) : null;
      
      return {
        assetTag: assetItem?.tag || "N/A",
        assetName: asset?.name || "Unknown",
        maintenanceType: record.maintenance_type || "N/A",
        status: record.maintenance_status || "N/A",
        description: record.description || "",
        scheduledDate: record.scheduled_date,
        completedDate: record.completed_date,
        performedBy: record.performed_by || "",
        cost: record.cost || 0,
        notes: record.notes || "",
      };
    });

    const totalCost = reportData.reduce((sum, r) => sum + (r.cost || 0), 0);
    const filename = `maintenance-report-${new Date().toISOString().split('T')[0]}`;

    if (exportType === "csv") {
      exportToCSV(reportData, [
        { key: "assetTag", header: "Asset Tag" },
        { key: "assetName", header: "Asset Name" },
        { key: "maintenanceType", header: "Type" },
        { key: "status", header: "Status" },
        { key: "description", header: "Description" },
        { key: "scheduledDate", header: "Scheduled Date", formatter: (v) => formatDateForExport(v as string) },
        { key: "completedDate", header: "Completed Date", formatter: (v) => formatDateForExport(v as string) },
        { key: "performedBy", header: "Performed By" },
        { key: "cost", header: "Cost", formatter: (v) => formatCurrencyForExport(v as number) },
        { key: "notes", header: "Notes" },
      ], filename);
    } else {
      generateReportPDF({
        title: "Maintenance Report",
        headers: ["Tag", "Asset", "Type", "Status", "Scheduled", "Completed", "Cost"],
        data: reportData.map(r => [
          r.assetTag,
          r.assetName,
          r.maintenanceType,
          r.status,
          formatDateForExport(r.scheduledDate),
          formatDateForExport(r.completedDate),
          formatCurrencyForExport(r.cost),
        ]),
        filename,
        dateRangeText: getDateRangeText(startDate, endDate),
      });
    }

    toast.info(`Total maintenance cost: ${formatCurrencyForExport(totalCost)}`);
  };

  const generateLocationInventoryReport = (exportType: "csv" | "pdf") => {
    if (!locations || locations.length === 0) {
      toast.error("No location data available");
      return;
    }

    const filteredItems = filterByDateRange(assetItems, "created_at", startDate, endDate);
    const filteredItemIds = filteredItems ? new Set(filteredItems.map((item) => item.id)) : null;

    const reportData = locations.map(location => {
      const itemsAtLocation = (assetItemsByLocationId.get(location.id) || []).filter((item) => {
        if (!filteredItemIds) return true;
        return filteredItemIds.has(item.id);
      });
      const totalValue = itemsAtLocation.reduce((sum, item) => {
        const asset = assetById.get(item.asset_id);
        return sum + (asset?.unit_price || 0);
      }, 0);
      
      const statusBreakdown = itemsAtLocation.reduce((acc, item) => {
        const status = item.item_status || "Unknown";
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return {
        locationName: location.name,
        address: location.address || "",
        totalItems: itemsAtLocation.length,
        totalValue,
        available: statusBreakdown["Available"] || 0,
        assigned: statusBreakdown["Assigned"] || 0,
        maintenance: statusBreakdown["Maintenance"] || 0,
        damaged: statusBreakdown["Damaged"] || 0,
        retired: statusBreakdown["Retired"] || 0,
      };
    });

    const filename = `location-inventory-${new Date().toISOString().split('T')[0]}`;

    if (exportType === "csv") {
      exportToCSV(reportData, [
        { key: "locationName", header: "Location" },
        { key: "address", header: "Address" },
        { key: "totalItems", header: "Total Items" },
        { key: "totalValue", header: "Total Value", formatter: (v) => formatCurrencyForExport(v as number) },
        { key: "available", header: "Available" },
        { key: "assigned", header: "Assigned" },
        { key: "maintenance", header: "In Maintenance" },
        { key: "damaged", header: "Damaged" },
        { key: "retired", header: "Retired" },
      ], filename);
    } else {
      generateReportPDF({
        title: "Location Inventory Report",
        headers: ["Location", "Items", "Value", "Available", "Assigned", "Maintenance", "Damaged"],
        data: reportData.map(r => [
          r.locationName,
          r.totalItems,
          formatCurrencyForExport(r.totalValue),
          r.available,
          r.assigned,
          r.maintenance,
          r.damaged,
        ]),
        filename,
        dateRangeText: getDateRangeText(startDate, endDate),
      });
    }
  };

  const generateFinancialSummaryReport = (exportType: "csv" | "pdf") => {
    const filteredAssets = filterByDateRange(assets, "acquisition_date", startDate, endDate);
    if (!filteredAssets || filteredAssets.length === 0) {
      toast.error("No asset data available for selected date range");
      return;
    }

    const categoryTotals: Record<string, { count: number; value: number }> = {};
    
    filteredAssets.forEach(asset => {
      const category = categoryById.get(asset.category_id || "");
      const categoryName = category?.name || "Uncategorized";
      const value = (asset.unit_price || 0) * (asset.quantity || 0);
      
      if (!categoryTotals[categoryName]) {
        categoryTotals[categoryName] = { count: 0, value: 0 };
      }
      categoryTotals[categoryName].count += asset.quantity || 0;
      categoryTotals[categoryName].value += value;
    });

    const reportData = Object.entries(categoryTotals).map(([category, data]) => ({
      category,
      assetCount: data.count,
      totalValue: data.value,
    }));

    const grandTotal = reportData.reduce((sum, r) => sum + r.totalValue, 0);
    const totalCount = reportData.reduce((sum, r) => sum + r.assetCount, 0);

    const filename = `financial-summary-${new Date().toISOString().split('T')[0]}`;

    if (exportType === "csv") {
      reportData.push({
        category: "GRAND TOTAL",
        assetCount: totalCount,
        totalValue: grandTotal,
      });

      exportToCSV(reportData, [
        { key: "category", header: "Category" },
        { key: "assetCount", header: "Asset Count" },
        { key: "totalValue", header: "Total Value", formatter: (v) => formatCurrencyForExport(v as number) },
      ], filename);
    } else {
      const pdfData = reportData.map(r => [
        r.category,
        r.assetCount,
        formatCurrencyForExport(r.totalValue),
      ]);
      pdfData.push(["GRAND TOTAL", totalCount, formatCurrencyForExport(grandTotal)]);

      generateReportPDF({
        title: "Financial Summary Report",
        headers: ["Category", "Asset Count", "Total Value"],
        data: pdfData,
        filename,
        dateRangeText: getDateRangeText(startDate, endDate),
      });
    }

    toast.info(`Total asset value: ${formatCurrencyForExport(grandTotal)}`);
  };

  const generateEmployeeAssetsReport = (exportType: "csv" | "pdf") => {
    if (!employees || employees.length === 0) {
      toast.error("No employee data available");
      return;
    }

    const filteredAssignments = filterByDateRange(assignments, "assigned_date", startDate, endDate);
    const activeAssignmentsByEmployeeId = (filteredAssignments || []).reduce((acc, assignment) => {
      if (!assignment.is_active || !assignment.employee_id) return acc;
      const existing = acc.get(assignment.employee_id) || [];
      acc.set(assignment.employee_id, [...existing, assignment]);
      return acc;
    }, new Map<string, any[]>());

    const reportData: Array<{
      employeeName: string;
      email: string;
      directorate: string;
      jobTitle: string;
      activeAssignments: number;
      assetTags: string;
    }> = [];

    employees.forEach(employee => {
      const directorateName = getDirectorateName(employee.id);
      const employeeAssignments = activeAssignmentsByEmployeeId.get(employee.id) || [];
      
      const assetTags = employeeAssignments.map(a => {
        const item = assetItemsById.get(a.asset_item_id || "");
        return item?.tag || "N/A";
      }).join("; ");

      reportData.push({
        employeeName: `${employee.first_name} ${employee.last_name}`,
        email: employee.email,
        directorate: directorateName,
        jobTitle: employee.job_title || "",
        activeAssignments: employeeAssignments.length,
        assetTags: assetTags || "None",
      });
    });

    const filename = `employee-assets-${new Date().toISOString().split('T')[0]}`;

    if (exportType === "csv") {
      exportToCSV(reportData, [
        { key: "employeeName", header: "Employee Name" },
        { key: "email", header: "Email" },
        { key: "directorate", header: "Directorate" },
        { key: "jobTitle", header: "Job Title" },
        { key: "activeAssignments", header: "Active Assignments" },
        { key: "assetTags", header: "Assigned Asset Tags" },
      ], filename);
    } else {
      generateReportPDF({
        title: "Employee Assets Report",
        headers: ["Employee", "Email", "Directorate", "Job Title", "Assignments", "Asset Tags"],
        data: reportData.map(r => [
          r.employeeName,
          r.email,
          r.directorate,
          r.jobTitle,
          r.activeAssignments,
          r.assetTags,
        ]),
        filename,
        dateRangeText: getDateRangeText(startDate, endDate),
      });
    }
  };

  const clearDateRange = () => {
    setStartDate(undefined);
    setEndDate(undefined);
  };

  return (
    <MainLayout title="Reports" description="Generate and view reports">
      <PageHeader
        title="Reports"
        description="Generate detailed reports for assets, assignments, and financials"
      />

      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onClear={clearDateRange}
        rangeText={getDateRangeText(startDate, endDate)}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {reports.map((report) => {
          const Icon = report.icon;
          const isGeneratingCSV = generatingReport === `${report.id}-csv`;
          const isGeneratingPDF = generatingReport === `${report.id}-pdf`;
          
          return (
            <Card key={report.id} className="group hover:shadow-md transition-all">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${categoryColors[report.category]}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">
                    {report.category}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <h3 className="font-semibold mb-1">{report.title}</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {report.description}
                </p>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    className="flex-1 gap-2"
                    onClick={() => handleGenerateReport(report.id, report.title, "csv")}
                    disabled={isGeneratingCSV || isGeneratingPDF}
                  >
                    {isGeneratingCSV ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    CSV
                  </Button>
                  <Button 
                    variant="default" 
                    className="flex-1 gap-2"
                    onClick={() => handleGenerateReport(report.id, report.title, "pdf")}
                    disabled={isGeneratingCSV || isGeneratingPDF}
                  >
                    {isGeneratingPDF ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileDown className="h-4 w-4" />
                    )}
                    PDF
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </MainLayout>
  );
}
