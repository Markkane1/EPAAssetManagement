import type {
  AssetItem,
  Assignment,
  Employee,
} from "@/types";
import { assetService } from "@/services/assetService";
import { assetItemService } from "@/services/assetItemService";
import { assignmentService } from "@/services/assignmentService";
import { categoryService } from "@/services/categoryService";
import { employeeService } from "@/services/employeeService";
import { exportToCSV, formatCurrencyForExport, formatDateForExport } from "@/lib/exportUtils";
import { getOfficeHolderId, isStoreHolder } from "@/lib/assetItemHolder";
import { locationService } from "@/services/locationService";
import { maintenanceService } from "@/services/maintenanceService";
import { filterByDateRange, generateReportPDF, getDateRangeText } from "@/lib/reporting";
import { buildDirectorateNameResolver, findCurrentEmployee } from "@/pages/reports/reportResolvers";

export type ReportExportType = "csv" | "pdf";
export type ReportId =
  | "asset-summary"
  | "asset-items-inventory"
  | "assignment-summary"
  | "status-report"
  | "maintenance-report"
  | "location-inventory"
  | "financial-summary"
  | "employee-assets";

export type GenerateReportRequest = {
  reportId: ReportId;
  exportType: ReportExportType;
  startDate?: Date;
  endDate?: Date;
  isEmployeeRole: boolean;
  userId?: string | null;
  userEmail?: string | null;
};

type GenerateReportResult = {
  notice?: string;
};

type EmployeeContext = {
  employees: Employee[];
  currentEmployee: Employee | null;
};

function getDateStamp() {
  return new Date().toISOString().split("T")[0];
}

async function loadEmployeeContext(request: GenerateReportRequest): Promise<EmployeeContext> {
  const employees = await employeeService.getAll();
  const currentEmployee = findCurrentEmployee(employees, request.userId, request.userEmail);

  if (request.isEmployeeRole && !currentEmployee) {
    throw new Error("Your account is not linked to an employee profile.");
  }

  return {
    employees,
    currentEmployee,
  };
}

async function generateAssetSummaryReport(
  request: GenerateReportRequest
): Promise<GenerateReportResult> {
  const [assets, categories, assetItems] = await Promise.all([
    assetService.getAll(),
    categoryService.getAll({ assetType: "ASSET" }),
    assetItemService.getAll(),
  ]);

  const filteredAssets = filterByDateRange(assets, "acquisition_date", request.startDate, request.endDate);
  if (filteredAssets.length === 0) {
    throw new Error("No asset data available for selected date range.");
  }

  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const assetItemsByAssetId = assetItems.reduce((acc, item) => {
    acc.set(item.asset_id, (acc.get(item.asset_id) || 0) + 1);
    return acc;
  }, new Map<string, number>());

  const reportData = filteredAssets.map((asset) => {
    const category = categoryById.get(asset.category_id || "");
    return {
      name: asset.name,
      description: asset.description || "",
      category: category?.name || "Uncategorized",
      quantity: asset.quantity || 0,
      itemCount: assetItemsByAssetId.get(asset.id) || 0,
      unitPrice: asset.unit_price || 0,
      totalValue: (asset.unit_price || 0) * (asset.quantity || 0),
      acquisitionDate: asset.acquisition_date,
      status: asset.is_active ? "Active" : "Inactive",
    };
  });

  const filename = `asset-summary-${getDateStamp()}`;

  if (request.exportType === "csv") {
    exportToCSV(
      reportData,
      [
        { key: "name", header: "Asset Name" },
        { key: "description", header: "Description" },
        { key: "category", header: "Category" },
        { key: "quantity", header: "Quantity" },
        { key: "itemCount", header: "Items Registered" },
        { key: "unitPrice", header: "Unit Price", formatter: (value) => formatCurrencyForExport(value as number) },
        { key: "totalValue", header: "Total Value", formatter: (value) => formatCurrencyForExport(value as number) },
        { key: "acquisitionDate", header: "Acquisition Date", formatter: (value) => formatDateForExport(value as string) },
        { key: "status", header: "Status" },
      ],
      filename
    );
    return {};
  }

  await generateReportPDF({
    title: "Asset Summary Report",
    headers: ["Name", "Category", "Qty", "Items", "Unit Price", "Total Value", "Acq. Date", "Status"],
    data: reportData.map((row) => [
      row.name,
      row.category,
      row.quantity,
      row.itemCount,
      formatCurrencyForExport(row.unitPrice),
      formatCurrencyForExport(row.totalValue),
      formatDateForExport(row.acquisitionDate),
      row.status,
    ]),
    filename,
    dateRangeText: getDateRangeText(request.startDate, request.endDate),
  });

  return {};
}

async function generateAssetItemsInventoryReport(
  request: GenerateReportRequest
): Promise<GenerateReportResult> {
  const [assetItems, assets, locations] = await Promise.all([
    assetItemService.getAll(),
    assetService.getAll(),
    locationService.getAll(),
  ]);

  const filteredItems = filterByDateRange(assetItems, "created_at", request.startDate, request.endDate);
  if (filteredItems.length === 0) {
    throw new Error("No asset items data available for selected date range.");
  }

  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const locationById = new Map(locations.map((location) => [location.id, location]));

  const reportData = filteredItems.map((item) => {
    const asset = assetById.get(item.asset_id);
    const officeId = getOfficeHolderId(item);
    const location = officeId ? locationById.get(officeId) : null;

    return {
      tag: item.tag || "N/A",
      assetName: asset?.name || "Unknown",
      serialNumber: item.serial_number || "N/A",
      location: isStoreHolder(item) ? "Head Office Store" : location?.name || "Unassigned",
      status: item.item_status || "Unknown",
      condition: item.item_condition || "Unknown",
      assignmentStatus: item.assignment_status || "Unknown",
      source: item.item_source || "Unknown",
      purchaseDate: item.purchase_date,
      warrantyExpiry: item.warranty_expiry,
    };
  });

  const filename = `asset-items-inventory-${getDateStamp()}`;

  if (request.exportType === "csv") {
    exportToCSV(
      reportData,
      [
        { key: "tag", header: "Asset Tag" },
        { key: "assetName", header: "Asset Name" },
        { key: "serialNumber", header: "Serial Number" },
        { key: "location", header: "Location" },
        { key: "status", header: "Status" },
        { key: "condition", header: "Condition" },
        { key: "assignmentStatus", header: "Assignment Status" },
        { key: "source", header: "Source" },
        { key: "purchaseDate", header: "Purchase Date", formatter: (value) => formatDateForExport(value as string) },
        { key: "warrantyExpiry", header: "Warranty Expiry", formatter: (value) => formatDateForExport(value as string) },
      ],
      filename
    );
    return {};
  }

  await generateReportPDF({
    title: "Asset Items Inventory Report",
    headers: ["Tag", "Asset", "Serial #", "Location", "Status", "Condition", "Assignment"],
    data: reportData.map((row) => [
      row.tag,
      row.assetName,
      row.serialNumber,
      row.location,
      row.status,
      row.condition,
      row.assignmentStatus,
    ]),
    filename,
    dateRangeText: getDateRangeText(request.startDate, request.endDate),
  });

  return {};
}

async function generateAssignmentSummaryReport(
  request: GenerateReportRequest
): Promise<GenerateReportResult> {
  const [{ employees, currentEmployee }, assignments, assetItems, assets, offices] = await Promise.all([
    loadEmployeeContext(request),
    assignmentService.getAll(),
    assetItemService.getAll(),
    assetService.getAll(),
    locationService.getAll(),
  ]);

  const filteredAssignments = filterByDateRange(
    assignments,
    "assigned_date",
    request.startDate,
    request.endDate
  );
  const scopedAssignments = request.isEmployeeRole
    ? filteredAssignments.filter((assignment) => assignment.employee_id === currentEmployee?.id)
    : filteredAssignments;

  if (scopedAssignments.length === 0) {
    throw new Error("No assignment data available for selected date range.");
  }

  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const assetItemById = new Map(assetItems.map((item) => [item.id, item]));
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const getDirectorateName = buildDirectorateNameResolver(offices, employees);

  const reportData = scopedAssignments.map((assignment) => {
    const employee = employeeById.get(assignment.employee_id || "");
    const assetItem = assetItemById.get(assignment.asset_item_id || "");
    const asset = assetItem ? assetById.get(assetItem.asset_id) : null;

    return {
      employeeName: employee ? `${employee.first_name} ${employee.last_name}`.trim() : "Unknown",
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

  const filename = `assignment-summary-${getDateStamp()}`;

  if (request.exportType === "csv") {
    exportToCSV(
      reportData,
      [
        { key: "employeeName", header: "Employee Name" },
        { key: "employeeEmail", header: "Email" },
        { key: "directorate", header: "Directorate" },
        { key: "assetTag", header: "Asset Tag" },
        { key: "assetName", header: "Asset Name" },
        { key: "assignedDate", header: "Assigned Date", formatter: (value) => formatDateForExport(value as string) },
        { key: "expectedReturnDate", header: "Expected Return", formatter: (value) => formatDateForExport(value as string) },
        { key: "returnedDate", header: "Returned Date", formatter: (value) => formatDateForExport(value as string) },
        { key: "status", header: "Status" },
        { key: "notes", header: "Notes" },
      ],
      filename
    );
    return {};
  }

  await generateReportPDF({
    title: "Assignment Summary Report",
    headers: ["Employee", "Directorate", "Asset Tag", "Asset", "Assigned", "Expected Return", "Status"],
    data: reportData.map((row) => [
      row.employeeName,
      row.directorate,
      row.assetTag,
      row.assetName,
      formatDateForExport(row.assignedDate),
      formatDateForExport(row.expectedReturnDate),
      row.status,
    ]),
    filename,
    dateRangeText: getDateRangeText(request.startDate, request.endDate),
  });

  return {};
}

async function generateStatusDistributionReport(
  request: GenerateReportRequest
): Promise<GenerateReportResult> {
  const assetItems = await assetItemService.getAll();
  const filteredItems = filterByDateRange(assetItems, "created_at", request.startDate, request.endDate);

  if (filteredItems.length === 0) {
    throw new Error("No asset items data available for selected date range.");
  }

  const statusCounts: Record<string, number> = {};
  const conditionCounts: Record<string, number> = {};
  const assignmentCounts: Record<string, number> = {};

  filteredItems.forEach((item) => {
    const status = item.item_status || "Unknown";
    const condition = item.item_condition || "Unknown";
    const assignment = item.assignment_status || "Unknown";

    statusCounts[status] = (statusCounts[status] || 0) + 1;
    conditionCounts[condition] = (conditionCounts[condition] || 0) + 1;
    assignmentCounts[assignment] = (assignmentCounts[assignment] || 0) + 1;
  });

  const filename = `status-distribution-${getDateStamp()}`;

  if (request.exportType === "csv") {
    const reportData = [
      { category: "--- STATUS DISTRIBUTION ---", type: "", count: "", percentage: "" },
      ...Object.entries(statusCounts).map(([type, count]) => ({
        category: "Status",
        type,
        count: String(count),
        percentage: `${((count / filteredItems.length) * 100).toFixed(1)}%`,
      })),
      { category: "--- CONDITION DISTRIBUTION ---", type: "", count: "", percentage: "" },
      ...Object.entries(conditionCounts).map(([type, count]) => ({
        category: "Condition",
        type,
        count: String(count),
        percentage: `${((count / filteredItems.length) * 100).toFixed(1)}%`,
      })),
      { category: "--- ASSIGNMENT DISTRIBUTION ---", type: "", count: "", percentage: "" },
      ...Object.entries(assignmentCounts).map(([type, count]) => ({
        category: "Assignment",
        type,
        count: String(count),
        percentage: `${((count / filteredItems.length) * 100).toFixed(1)}%`,
      })),
    ];

    exportToCSV(
      reportData,
      [
        { key: "category", header: "Category" },
        { key: "type", header: "Type" },
        { key: "count", header: "Count" },
        { key: "percentage", header: "Percentage" },
      ],
      filename
    );
    return {};
  }

  const pdfData: (string | number)[][] = [];
  pdfData.push(["STATUS DISTRIBUTION", "", "", ""]);
  Object.entries(statusCounts).forEach(([type, count]) => {
    pdfData.push(["Status", type, count, `${((count / filteredItems.length) * 100).toFixed(1)}%`]);
  });
  pdfData.push(["CONDITION DISTRIBUTION", "", "", ""]);
  Object.entries(conditionCounts).forEach(([type, count]) => {
    pdfData.push(["Condition", type, count, `${((count / filteredItems.length) * 100).toFixed(1)}%`]);
  });
  pdfData.push(["ASSIGNMENT DISTRIBUTION", "", "", ""]);
  Object.entries(assignmentCounts).forEach(([type, count]) => {
    pdfData.push(["Assignment", type, count, `${((count / filteredItems.length) * 100).toFixed(1)}%`]);
  });

  await generateReportPDF({
    title: "Status Distribution Report",
    headers: ["Category", "Type", "Count", "Percentage"],
    data: pdfData,
    filename,
    dateRangeText: getDateRangeText(request.startDate, request.endDate),
  });

  return {};
}

async function generateMaintenanceReport(
  request: GenerateReportRequest
): Promise<GenerateReportResult> {
  const [maintenance, assetItems, assets] = await Promise.all([
    maintenanceService.getAll(),
    assetItemService.getAll(),
    assetService.getAll(),
  ]);

  const filteredMaintenance = filterByDateRange(
    maintenance,
    "scheduled_date",
    request.startDate,
    request.endDate
  );
  if (filteredMaintenance.length === 0) {
    throw new Error("No maintenance data available for selected date range.");
  }

  const assetItemById = new Map(assetItems.map((item) => [item.id, item]));
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));

  const reportData = filteredMaintenance.map((record) => {
    const assetItem = assetItemById.get(record.asset_item_id || "");
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

  const totalCost = reportData.reduce((sum, row) => sum + (row.cost || 0), 0);
  const filename = `maintenance-report-${getDateStamp()}`;

  if (request.exportType === "csv") {
    exportToCSV(
      reportData,
      [
        { key: "assetTag", header: "Asset Tag" },
        { key: "assetName", header: "Asset Name" },
        { key: "maintenanceType", header: "Type" },
        { key: "status", header: "Status" },
        { key: "description", header: "Description" },
        { key: "scheduledDate", header: "Scheduled Date", formatter: (value) => formatDateForExport(value as string) },
        { key: "completedDate", header: "Completed Date", formatter: (value) => formatDateForExport(value as string) },
        { key: "performedBy", header: "Performed By" },
        { key: "cost", header: "Cost", formatter: (value) => formatCurrencyForExport(value as number) },
        { key: "notes", header: "Notes" },
      ],
      filename
    );
  } else {
    await generateReportPDF({
      title: "Maintenance Report",
      headers: ["Tag", "Asset", "Type", "Status", "Scheduled", "Completed", "Cost"],
      data: reportData.map((row) => [
        row.assetTag,
        row.assetName,
        row.maintenanceType,
        row.status,
        formatDateForExport(row.scheduledDate),
        formatDateForExport(row.completedDate),
        formatCurrencyForExport(row.cost),
      ]),
      filename,
      dateRangeText: getDateRangeText(request.startDate, request.endDate),
    });
  }

  return {
    notice: `Total maintenance cost: ${formatCurrencyForExport(totalCost)}`,
  };
}

async function generateLocationInventoryReport(
  request: GenerateReportRequest
): Promise<GenerateReportResult> {
  const [locations, assetItems, assets] = await Promise.all([
    locationService.getAll(),
    assetItemService.getAll(),
    assetService.getAll(),
  ]);

  if (locations.length === 0) {
    throw new Error("No location data available.");
  }

  const filteredItems = filterByDateRange(assetItems, "created_at", request.startDate, request.endDate);
  const filteredItemIds = new Set(filteredItems.map((item) => item.id));
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));

  const assetItemsByLocationId = assetItems.reduce((acc, item) => {
    const officeId = getOfficeHolderId(item);
    if (!officeId) return acc;
    const existing = acc.get(officeId) || [];
    existing.push(item);
    acc.set(officeId, existing);
    return acc;
  }, new Map<string, AssetItem[]>());

  const storeItems = assetItems.filter((item) => isStoreHolder(item) && filteredItemIds.has(item.id));

  const officeRows = locations.map((location) => {
    const itemsAtLocation = (assetItemsByLocationId.get(location.id) || []).filter((item) =>
      filteredItemIds.has(item.id)
    );
    const totalValue = itemsAtLocation.reduce((sum, item) => {
      const asset = assetById.get(item.asset_id);
      return sum + (asset?.unit_price || 0);
    }, 0);

    const statusBreakdown = itemsAtLocation.reduce<Record<string, number>>((acc, item) => {
      const status = item.item_status || "Unknown";
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    return {
      locationName: location.name,
      address: location.address || "",
      totalItems: itemsAtLocation.length,
      totalValue,
      available: statusBreakdown.Available || 0,
      assigned: statusBreakdown.Assigned || 0,
      maintenance: statusBreakdown.Maintenance || 0,
      damaged: statusBreakdown.Damaged || 0,
      retired: statusBreakdown.Retired || 0,
    };
  });

  const storeStatusBreakdown = storeItems.reduce<Record<string, number>>((acc, item) => {
    const status = item.item_status || "Unknown";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  const storeValue = storeItems.reduce((sum, item) => {
    const asset = assetById.get(item.asset_id);
    return sum + (asset?.unit_price || 0);
  }, 0);

  const reportData = [
    ...officeRows,
    {
      locationName: "Head Office Store",
      address: "System Store",
      totalItems: storeItems.length,
      totalValue: storeValue,
      available: storeStatusBreakdown.Available || 0,
      assigned: storeStatusBreakdown.Assigned || 0,
      maintenance: storeStatusBreakdown.Maintenance || 0,
      damaged: storeStatusBreakdown.Damaged || 0,
      retired: storeStatusBreakdown.Retired || 0,
    },
  ];

  const filename = `location-inventory-${getDateStamp()}`;

  if (request.exportType === "csv") {
    exportToCSV(
      reportData,
      [
        { key: "locationName", header: "Location" },
        { key: "address", header: "Address" },
        { key: "totalItems", header: "Total Items" },
        { key: "totalValue", header: "Total Value", formatter: (value) => formatCurrencyForExport(value as number) },
        { key: "available", header: "Available" },
        { key: "assigned", header: "Assigned" },
        { key: "maintenance", header: "In Maintenance" },
        { key: "damaged", header: "Damaged" },
        { key: "retired", header: "Retired" },
      ],
      filename
    );
    return {};
  }

  await generateReportPDF({
    title: "Location Inventory Report",
    headers: ["Location", "Items", "Value", "Available", "Assigned", "Maintenance", "Damaged"],
    data: reportData.map((row) => [
      row.locationName,
      row.totalItems,
      formatCurrencyForExport(row.totalValue),
      row.available,
      row.assigned,
      row.maintenance,
      row.damaged,
    ]),
    filename,
    dateRangeText: getDateRangeText(request.startDate, request.endDate),
  });

  return {};
}

async function generateFinancialSummaryReport(
  request: GenerateReportRequest
): Promise<GenerateReportResult> {
  const [assets, categories] = await Promise.all([
    assetService.getAll(),
    categoryService.getAll({ assetType: "ASSET" }),
  ]);

  const filteredAssets = filterByDateRange(assets, "acquisition_date", request.startDate, request.endDate);
  if (filteredAssets.length === 0) {
    throw new Error("No asset data available for selected date range.");
  }

  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const categoryTotals: Record<string, { count: number; value: number }> = {};

  filteredAssets.forEach((asset) => {
    const categoryName = categoryById.get(asset.category_id || "")?.name || "Uncategorized";
    const value = (asset.unit_price || 0) * (asset.quantity || 0);
    if (!categoryTotals[categoryName]) {
      categoryTotals[categoryName] = { count: 0, value: 0 };
    }
    categoryTotals[categoryName].count += asset.quantity || 0;
    categoryTotals[categoryName].value += value;
  });

  const reportData = Object.entries(categoryTotals).map(([category, totals]) => ({
    category,
    assetCount: totals.count,
    totalValue: totals.value,
  }));

  const grandTotal = reportData.reduce((sum, row) => sum + row.totalValue, 0);
  const totalCount = reportData.reduce((sum, row) => sum + row.assetCount, 0);
  const filename = `financial-summary-${getDateStamp()}`;

  if (request.exportType === "csv") {
    exportToCSV(
      [
        ...reportData,
        {
          category: "GRAND TOTAL",
          assetCount: totalCount,
          totalValue: grandTotal,
        },
      ],
      [
        { key: "category", header: "Category" },
        { key: "assetCount", header: "Asset Count" },
        { key: "totalValue", header: "Total Value", formatter: (value) => formatCurrencyForExport(value as number) },
      ],
      filename
    );
  } else {
    await generateReportPDF({
      title: "Financial Summary Report",
      headers: ["Category", "Asset Count", "Total Value"],
      data: [
        ...reportData.map((row) => [
          row.category,
          row.assetCount,
          formatCurrencyForExport(row.totalValue),
        ]),
        ["GRAND TOTAL", totalCount, formatCurrencyForExport(grandTotal)],
      ],
      filename,
      dateRangeText: getDateRangeText(request.startDate, request.endDate),
    });
  }

  return {
    notice: `Total asset value: ${formatCurrencyForExport(grandTotal)}`,
  };
}

async function generateEmployeeAssetsReport(
  request: GenerateReportRequest
): Promise<GenerateReportResult> {
  const [{ employees, currentEmployee }, assignments, assetItems, offices] = await Promise.all([
    loadEmployeeContext(request),
    assignmentService.getAll(),
    assetItemService.getAll(),
    locationService.getAll(),
  ]);

  const filteredAssignments = filterByDateRange(
    assignments,
    "assigned_date",
    request.startDate,
    request.endDate
  );
  const activeAssignmentsByEmployeeId = filteredAssignments.reduce((acc, assignment) => {
    if (!assignment.is_active || !assignment.employee_id) return acc;
    const existing = acc.get(assignment.employee_id) || [];
    existing.push(assignment);
    acc.set(assignment.employee_id, existing);
    return acc;
  }, new Map<string, Assignment[]>());

  const scopedEmployees = request.isEmployeeRole ? (currentEmployee ? [currentEmployee] : []) : employees;
  if (scopedEmployees.length === 0) {
    throw new Error("No employee data available.");
  }

  const getDirectorateName = buildDirectorateNameResolver(offices, employees);
  const assetItemById = new Map(assetItems.map((item) => [item.id, item]));

  const reportData = scopedEmployees.map((employee) => {
    const employeeAssignments = activeAssignmentsByEmployeeId.get(employee.id) || [];
    const assetTags = employeeAssignments
      .map((assignment) => assetItemById.get(assignment.asset_item_id || "")?.tag || "N/A")
      .join("; ");

    return {
      employeeName: `${employee.first_name} ${employee.last_name}`.trim(),
      email: employee.email,
      directorate: getDirectorateName(employee.id),
      jobTitle: employee.job_title || "",
      activeAssignments: employeeAssignments.length,
      assetTags: assetTags || "None",
    };
  });

  const filename = `employee-assets-${getDateStamp()}`;

  if (request.exportType === "csv") {
    exportToCSV(
      reportData,
      [
        { key: "employeeName", header: "Employee Name" },
        { key: "email", header: "Email" },
        { key: "directorate", header: "Directorate" },
        { key: "jobTitle", header: "Job Title" },
        { key: "activeAssignments", header: "Active Assignments" },
        { key: "assetTags", header: "Assigned Asset Tags" },
      ],
      filename
    );
    return {};
  }

  await generateReportPDF({
    title: "Employee Assets Report",
    headers: ["Employee", "Email", "Directorate", "Job Title", "Assignments", "Asset Tags"],
    data: reportData.map((row) => [
      row.employeeName,
      row.email,
      row.directorate,
      row.jobTitle,
      row.activeAssignments,
      row.assetTags,
    ]),
    filename,
    dateRangeText: getDateRangeText(request.startDate, request.endDate),
  });

  return {};
}

export async function generateRequestedReport(
  request: GenerateReportRequest
): Promise<GenerateReportResult> {
  switch (request.reportId) {
    case "asset-summary":
      return generateAssetSummaryReport(request);
    case "asset-items-inventory":
      return generateAssetItemsInventoryReport(request);
    case "assignment-summary":
      return generateAssignmentSummaryReport(request);
    case "status-report":
      return generateStatusDistributionReport(request);
    case "maintenance-report":
      return generateMaintenanceReport(request);
    case "location-inventory":
      return generateLocationInventoryReport(request);
    case "financial-summary":
      return generateFinancialSummaryReport(request);
    case "employee-assets":
      return generateEmployeeAssetsReport(request);
    default:
      throw new Error("Report not available.");
  }
}
