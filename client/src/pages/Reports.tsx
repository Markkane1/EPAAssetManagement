import { useEffect, useMemo, useState } from "react";
import type { ElementType } from "react";
import { useQuery } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { ViewModeToggle } from "@/components/shared/ViewModeToggle";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { FilterBar, WorkflowPanel } from "@/components/shared/workflow";
import { useViewMode } from "@/hooks/useViewMode";
import { usePageSearch } from "@/contexts/PageSearchContext";
import { useAuth } from "@/contexts/AuthContext";
import { useLocations } from "@/hooks/useLocations";
import { useCategories } from "@/hooks/useCategories";
import { reportService } from "@/services/reportService";
import { exportToCSV, formatDateForExport } from "@/lib/exportUtils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Activity,
  AlertCircle,
  ArrowLeftRight,
  Boxes,
  ClipboardList,
  Download,
  FileClock,
  FlaskConical,
  Loader2,
  Package,
  Route,
  ScanSearch,
  ShoppingCart,
  Timer,
  TrendingUp,
} from "lucide-react";

type ServerReportId =
  | "inventory-snapshot-moveable"
  | "inventory-snapshot-consumable"
  | "moveable-assigned"
  | "consumable-assigned"
  | "consumable-consumed"
  | "requisitions"
  | "requisition-aging"
  | "return-aging"
  | "analytics-trends"
  | "moveable-lifecycle"
  | "lot-lifecycle"
  | "assignment-trace";

type ReportRow = {
  id: string;
  [key: string]: unknown;
};

type ReportColumn = {
  key: string;
  label: string;
  render?: (value: unknown, row: ReportRow) => React.ReactNode;
};

type ReportSummary = {
  label: string;
  value: string;
  note?: string;
};

type ReportPresentation = {
  rows: ReportRow[];
  columns: ReportColumn[];
  summary: ReportSummary[];
  total: number;
  isPaginated: boolean;
  emptyState: {
    title: string;
    description: string;
  };
  exportFileName: string;
};

type ReportDefinition = {
  id: ServerReportId;
  title: string;
  description: string;
  category: string;
  icon: ElementType;
  endpoint: string;
};

type ReportFilters = {
  officeId: string;
  categoryId: string;
  holderType: string;
  holderId: string;
  itemId: string;
  status: string;
  consumptionMode: "office" | "central";
  granularity: "day" | "week" | "month";
  assetItemId: string;
  lotId: string;
  assignmentId: string;
  from: string;
  to: string;
};

const REPORTS: ReportDefinition[] = [
  {
    id: "inventory-snapshot-moveable",
    title: "Inventory Snapshot",
    description: "Grouped moveable inventory by holder and category.",
    category: "Inventory",
    icon: Boxes,
    endpoint: "GET /api/reports/inventory-snapshot?mode=moveable",
  },
  {
    id: "inventory-snapshot-consumable",
    title: "Consumable Snapshot",
    description: "Current consumable balances by holder, lot, and item.",
    category: "Inventory",
    icon: FlaskConical,
    endpoint: "GET /api/reports/inventory-snapshot?mode=consumable",
  },
  {
    id: "moveable-assigned",
    title: "Moveable Assigned",
    description: "Latest active assignment for moveable asset items.",
    category: "Assignments",
    icon: Package,
    endpoint: "GET /api/reports/moveable-assigned",
  },
  {
    id: "consumable-assigned",
    title: "Consumable Assigned",
    description: "Consumable balances held at offices, stores, employees, and sub-locations.",
    category: "Assignments",
    icon: ClipboardList,
    endpoint: "GET /api/reports/consumable-assigned",
  },
  {
    id: "consumable-consumed",
    title: "Consumable Consumption",
    description: "Consumption transactions with quantity and holder context.",
    category: "Assignments",
    icon: ShoppingCart,
    endpoint: "GET /api/reports/consumable-consumption",
  },
  {
    id: "requisitions",
    title: "Requisitions Register",
    description: "Operational requisition list with status distribution.",
    category: "Workflow",
    icon: FileClock,
    endpoint: "GET /api/reports/requisitions",
  },
  {
    id: "requisition-aging",
    title: "Requisition Aging",
    description: "Open and historical requisitions bucketed by age.",
    category: "Workflow",
    icon: Timer,
    endpoint: "GET /api/reports/requisition-aging",
  },
  {
    id: "return-aging",
    title: "Return Aging",
    description: "Return requests bucketed by age and status.",
    category: "Workflow",
    icon: Timer,
    endpoint: "GET /api/reports/return-aging",
  },
  {
    id: "analytics-trends",
    title: "Analytics Trends",
    description: "Consumable transaction trends over time.",
    category: "Analytics",
    icon: TrendingUp,
    endpoint: "GET /api/reports/analytics-trends",
  },
  {
    id: "moveable-lifecycle",
    title: "Moveable Lifecycle",
    description: "Assignment, transfer, and maintenance timeline for one asset item.",
    category: "Traceability",
    icon: Route,
    endpoint: "GET /api/reports/moveable-lifecycle/:assetItemId",
  },
  {
    id: "lot-lifecycle",
    title: "Lot Lifecycle",
    description: "Transaction history for one consumable lot.",
    category: "Traceability",
    icon: ScanSearch,
    endpoint: "GET /api/reports/lot-lifecycle/:lotId",
  },
  {
    id: "assignment-trace",
    title: "Assignment Trace",
    description: "Single-assignment trace linking requisition, asset item, and return request.",
    category: "Traceability",
    icon: ArrowLeftRight,
    endpoint: "GET /api/reports/assignment-trace/:assignmentId",
  },
];

const DEFAULT_REPORT_ID: ServerReportId = "inventory-snapshot-moveable";

const CATEGORY_COLORS: Record<string, string> = {
  Inventory: "bg-primary/10 text-primary",
  Assignments: "bg-info/10 text-info",
  Workflow: "bg-warning/10 text-warning",
  Analytics: "bg-success/10 text-success",
  Traceability: "bg-accent text-accent-foreground",
};

const SUMMARY_CARD_VARIANTS = ["primary", "info", "success", "warning"] as const;

const DEFAULT_FILTERS: ReportFilters = {
  officeId: "ALL",
  categoryId: "ALL",
  holderType: "ALL",
  holderId: "",
  itemId: "",
  status: "ALL",
  consumptionMode: "office",
  granularity: "day",
  assetItemId: "",
  lotId: "",
  assignmentId: "",
  from: "",
  to: "",
};

const HOLDER_OPTIONS = [
  { value: "ALL", label: "All holder types" },
  { value: "OFFICE", label: "Office" },
  { value: "STORE", label: "Store" },
  { value: "EMPLOYEE", label: "Employee" },
  { value: "SUB_LOCATION", label: "Sub-location" },
];

const REQUISITION_STATUS_OPTIONS = [
  { value: "ALL", label: "All statuses" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "APPROVED", label: "Approved" },
  { value: "PARTIALLY_FULFILLED", label: "Partially Fulfilled" },
  { value: "FULFILLED", label: "Fulfilled" },
  { value: "FULFILLED_PENDING_SIGNATURE", label: "Fulfilled Pending Signature" },
  { value: "REJECTED_INVALID", label: "Rejected Invalid" },
  { value: "CANCELLED", label: "Cancelled" },
];

const RETURN_STATUS_OPTIONS = [
  { value: "ALL", label: "All statuses" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "RECEIVED_CONFIRMED", label: "Received Confirmed" },
  { value: "CLOSED_PENDING_SIGNATURE", label: "Closed Pending Signature" },
  { value: "CLOSED", label: "Closed" },
  { value: "REJECTED", label: "Rejected" },
];

function toOptionalString(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function formatDateTime(value: unknown) {
  if (!value) return "N/A";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function formatShortDate(value: unknown) {
  return formatDateForExport(value as string | Date | null | undefined) || "N/A";
}

function formatNumeric(value: unknown) {
  const numeric = Number(value || 0);
  return numeric.toLocaleString("en-PK", {
    maximumFractionDigits: 2,
  });
}

function resolveOfficeName(officeId: unknown, officeNameById: Map<string, string>) {
  const key = String(officeId || "").trim();
  if (!key) return "N/A";
  return officeNameById.get(key) || key;
}

function resolveCategoryName(categoryId: unknown, categoryNameById: Map<string, string>) {
  const key = String(categoryId || "").trim();
  if (!key) return "Uncategorized";
  return categoryNameById.get(key) || key;
}

function resolveHolderLabel(holderType: unknown, holderId: unknown, officeNameById: Map<string, string>) {
  const type = String(holderType || "").trim().toUpperCase();
  const id = String(holderId || "").trim();
  if (!type && !id) return "N/A";
  if (type === "OFFICE" || type === "STORE") {
    return `${type}: ${resolveOfficeName(id, officeNameById)}`;
  }
  return `${type || "HOLDER"}: ${id || "N/A"}`;
}

function renderBadge(value: unknown, variant: "outline" | "secondary" | "default" = "outline") {
  return (
    <Badge variant={variant} className="table-pill max-w-[16rem] justify-start text-left">
      <span>{String(value || "N/A")}</span>
    </Badge>
  );
}

function buildPresentation(
  reportId: ServerReportId,
  data: any,
  officeNameById: Map<string, string>,
  categoryNameById: Map<string, string>,
): ReportPresentation {
  switch (reportId) {
    case "inventory-snapshot-moveable": {
      const rows = (data?.items || []).map((group: any, index: number) => ({
        id: `moveable-snapshot-${index}`,
        category: resolveCategoryName(group?._id?.category_id, categoryNameById),
        holderType: group?._id?.holder_type || "N/A",
        holder: resolveHolderLabel(group?._id?.holder_type, group?._id?.holder_id, officeNameById),
        count: Number(group?.count || 0),
        sampleAssets: (group?.items || [])
          .slice(0, 3)
          .map((item: any) => item?.tag || item?.serial_number || item?._id)
          .filter(Boolean)
          .join(", ") || "N/A",
      }));
      const totalItems = rows.reduce((sum, row) => sum + Number(row.count || 0), 0);
      return {
        rows,
        columns: [
          { key: "category", label: "Category", render: (value) => renderBadge(value, "secondary") },
          { key: "holderType", label: "Holder Type", render: (value) => renderBadge(value) },
          { key: "holder", label: "Holder" },
          { key: "count", label: "Item Count", render: (value) => <span className="font-medium">{formatNumeric(value)}</span> },
          { key: "sampleAssets", label: "Sample Assets" },
        ],
        summary: [
          { label: "Groups", value: formatNumeric(data?.total || rows.length) },
          { label: "Asset Items", value: formatNumeric(totalItems) },
          { label: "Mode", value: "Moveable" },
        ],
        total: Number(data?.total || rows.length),
        isPaginated: true,
        emptyState: {
          title: "No moveable snapshot rows found.",
          description: "Adjust the office, category, date, or holder filters and try again.",
        },
        exportFileName: "report-inventory-snapshot-moveable",
      };
    }
    case "inventory-snapshot-consumable": {
      const rows = (data?.items || []).map((group: any, index: number) => ({
        id: `consumable-snapshot-${index}`,
        category: resolveCategoryName(group?._id?.category_id, categoryNameById),
        holderType: group?._id?.holder_type || "N/A",
        holder: resolveHolderLabel(group?._id?.holder_type, group?._id?.holder_id, officeNameById),
        itemName: group?.item_name || "Unknown item",
        quantityOnHand: Number(group?.qty_on_hand_base || 0),
      }));
      const totalQty = rows.reduce((sum, row) => sum + Number(row.quantityOnHand || 0), 0);
      return {
        rows,
        columns: [
          { key: "itemName", label: "Consumable Item" },
          { key: "category", label: "Category", render: (value) => renderBadge(value, "secondary") },
          { key: "holderType", label: "Holder Type", render: (value) => renderBadge(value) },
          { key: "holder", label: "Holder" },
          { key: "quantityOnHand", label: "Qty On Hand", render: (value) => <span className="font-medium">{formatNumeric(value)}</span> },
        ],
        summary: [
          { label: "Groups", value: formatNumeric(data?.total || rows.length) },
          { label: "Total Qty", value: formatNumeric(totalQty) },
          { label: "Mode", value: "Consumable" },
        ],
        total: Number(data?.total || rows.length),
        isPaginated: true,
        emptyState: {
          title: "No consumable snapshot rows found.",
          description: "Adjust the office, category, or holder filters and try again.",
        },
        exportFileName: "report-inventory-snapshot-consumable",
      };
    }
    case "moveable-assigned": {
      const rows = (data?.items || []).map((item: any) => ({
        id: String(item?.assignment_id || item?._id),
        assetName: item?.asset_name || "Unknown asset",
        tag: item?.tag || item?.serial_number || "N/A",
        holder: resolveHolderLabel(item?.holder_type, item?.holder_id, officeNameById),
        assignedTo: `${item?.assigned_to_type || "N/A"}${item?.assigned_to_id ? ` - ${item.assigned_to_id}` : ""}`.trim(),
        assignedDate: item?.assigned_date,
        assignmentWorkflowStatus: item?.assignment_workflow_status || "N/A",
        itemStatus: item?.item_status || "N/A",
      }));
      return {
        rows,
        columns: [
          { key: "assetName", label: "Asset" },
          { key: "tag", label: "Tag / Serial" },
          { key: "holder", label: "Current Holder" },
          { key: "assignedTo", label: "Assigned To" },
          { key: "assignmentWorkflowStatus", label: "Workflow Status", render: (value) => renderBadge(value) },
          { key: "itemStatus", label: "Item Status", render: (value) => renderBadge(value, "secondary") },
          { key: "assignedDate", label: "Assigned Date", render: (value) => formatDateTime(value) },
        ],
        summary: [
          { label: "Assignments", value: formatNumeric(data?.total || rows.length) },
          { label: "Scoped Office", value: data?.officeId ? resolveOfficeName(data.officeId, officeNameById) : "All accessible offices" },
        ],
        total: Number(data?.total || rows.length),
        isPaginated: true,
        emptyState: {
          title: "No assigned moveable items found.",
          description: "Try broadening the holder, category, or date filters.",
        },
        exportFileName: "report-moveable-assigned",
      };
    }
    case "consumable-assigned": {
      const rows = (data?.items || []).map((item: any, index: number) => ({
        id: String(item?._id || `${item?.consumable_item_id}-${index}`),
        itemName: item?.item_name || "Unknown item",
        holder: resolveHolderLabel(item?.holder_type, item?.holder_id, officeNameById),
        lotId: item?.lot_id || "N/A",
        qtyOnHand: Number(item?.qty_on_hand_base || 0),
        qtyReserved: Number(item?.qty_reserved_base || 0),
        baseUom: item?.base_uom || "N/A",
        controlled: item?.is_controlled ? "Controlled" : "Standard",
      }));
      const totalQty = rows.reduce((sum, row) => sum + Number(row.qtyOnHand || 0), 0);
      return {
        rows,
        columns: [
          { key: "itemName", label: "Consumable Item" },
          { key: "holder", label: "Holder" },
          { key: "lotId", label: "Lot" },
          { key: "qtyOnHand", label: "Qty On Hand", render: (value) => <span className="font-medium">{formatNumeric(value)}</span> },
          { key: "qtyReserved", label: "Reserved", render: (value) => <span className="font-medium">{formatNumeric(value)}</span> },
          { key: "baseUom", label: "Base UOM" },
          { key: "controlled", label: "Control", render: (value) => renderBadge(value, "secondary") },
        ],
        summary: [
          { label: "Balance Rows", value: formatNumeric(data?.total || rows.length) },
          { label: "Qty On Hand", value: formatNumeric(totalQty) },
        ],
        total: Number(data?.total || rows.length),
        isPaginated: true,
        emptyState: {
          title: "No consumable assignment balances found.",
          description: "Try a different office, holder, item, or category filter.",
        },
        exportFileName: "report-consumable-assigned",
      };
    }
    case "consumable-consumed": {
      const rows = (data?.items || []).map((item: any, index: number) => ({
        id: String(item?._id || `${item?.consumable_item_id}-${index}`),
        txTime: item?.tx_time,
        itemName: item?.item_name || "Unknown item",
        fromHolder: resolveHolderLabel(item?.from_holder_type, item?.from_holder_id, officeNameById),
        qtyBase: Number(item?.qty_base || 0),
        enteredQty: `${formatNumeric(item?.entered_qty || 0)} ${item?.entered_uom || ""}`.trim(),
        reference: item?.reference || "N/A",
        notes: item?.notes || "N/A",
      }));
      return {
        rows,
        columns: [
          { key: "txTime", label: "Consumed At", render: (value) => formatDateTime(value) },
          { key: "itemName", label: "Consumable Item" },
          { key: "fromHolder", label: "Source Holder" },
          { key: "qtyBase", label: "Qty Base", render: (value) => <span className="font-medium">{formatNumeric(value)}</span> },
          { key: "enteredQty", label: "Entered Qty" },
          { key: "reference", label: "Reference" },
          { key: "notes", label: "Notes" },
        ],
        summary: [
          { label: "Transactions", value: formatNumeric(data?.total || rows.length) },
          { label: "Total Qty", value: formatNumeric(data?.totalQtyBase || 0) },
          { label: "Mode", value: String(data?.mode || "office") },
        ],
        total: Number(data?.total || rows.length),
        isPaginated: true,
        emptyState: {
          title: "No consumable consumption rows found.",
          description: "Adjust the date range, mode, office, or item filters and try again.",
        },
        exportFileName: "report-consumable-consumed",
      };
    }
    case "requisitions": {
      const rows = (data?.items || []).map((item: any) => ({
        id: String(item?.id || item?._id),
        fileNumber: item?.file_number || "N/A",
        office: resolveOfficeName(item?.office_id, officeNameById),
        issuingOffice: resolveOfficeName(item?.issuing_office_id, officeNameById),
        status: item?.status || "N/A",
        signedIssueSlip: item?.signed_issuance_document_id ? "Attached" : "Missing",
        submittedAt: item?.created_at,
        updatedAt: item?.updated_at,
      }));
      return {
        rows,
        columns: [
          { key: "fileNumber", label: "File Number" },
          { key: "office", label: "Requesting Office" },
          { key: "issuingOffice", label: "Issuing Office" },
          { key: "status", label: "Status", render: (value) => renderBadge(value) },
          { key: "signedIssueSlip", label: "Signed Issue Slip", render: (value) => renderBadge(value, "secondary") },
          { key: "submittedAt", label: "Submitted", render: (value) => formatDateTime(value) },
          { key: "updatedAt", label: "Updated", render: (value) => formatDateTime(value) },
        ],
        summary: [
          { label: "Requisitions", value: formatNumeric(data?.total || rows.length) },
          ...(data?.statusSummary || []).slice(0, 3).map((row: any) => ({
            label: row?.status || "Unknown",
            value: formatNumeric(row?.count || 0),
          })),
        ],
        total: Number(data?.total || rows.length),
        isPaginated: true,
        emptyState: {
          title: "No requisitions found.",
          description: "Adjust the office, status, or date filters and try again.",
        },
        exportFileName: "report-requisitions",
      };
    }
    case "requisition-aging": {
      const rows = (data?.items || []).map((item: any) => ({
        id: String(item?._id || item?.file_number),
        fileNumber: item?.file_number || "N/A",
        office: resolveOfficeName(item?.office_id, officeNameById),
        status: item?.status || "N/A",
        ageDays: Number(item?.age_days || 0).toFixed(1),
        ageBucket: item?.age_bucket || "N/A",
        createdAt: item?.created_at,
      }));
      return {
        rows,
        columns: [
          { key: "fileNumber", label: "File Number" },
          { key: "office", label: "Office" },
          { key: "status", label: "Status", render: (value) => renderBadge(value) },
          { key: "ageBucket", label: "Age Bucket", render: (value) => renderBadge(value, "secondary") },
          { key: "ageDays", label: "Age (Days)", render: (value) => <span className="font-medium">{value}</span> },
          { key: "createdAt", label: "Created", render: (value) => formatDateTime(value) },
        ],
        summary: [
          { label: "Requisitions", value: formatNumeric(data?.total || rows.length) },
          ...(data?.buckets || []).slice(0, 3).map((bucket: any) => ({
            label: bucket?.bucket || "Unknown",
            value: formatNumeric(bucket?.count || 0),
          })),
        ],
        total: Number(data?.total || rows.length),
        isPaginated: true,
        emptyState: {
          title: "No requisition aging rows found.",
          description: "Adjust the office, status, or date filters and try again.",
        },
        exportFileName: "report-requisition-aging",
      };
    }
    case "return-aging": {
      const rows = (data?.items || []).map((item: any) => ({
        id: String(item?._id || `${item?.office_id}-${item?.created_at}`),
        office: resolveOfficeName(item?.office_id, officeNameById),
        employeeId: item?.employee_id || "N/A",
        assetItemId: item?.asset_item_id || "N/A",
        status: item?.status || "N/A",
        ageDays: Number(item?.age_days || 0).toFixed(1),
        ageBucket: item?.age_bucket || "N/A",
        createdAt: item?.created_at,
      }));
      return {
        rows,
        columns: [
          { key: "office", label: "Office" },
          { key: "employeeId", label: "Employee" },
          { key: "assetItemId", label: "Asset Item" },
          { key: "status", label: "Status", render: (value) => renderBadge(value) },
          { key: "ageBucket", label: "Age Bucket", render: (value) => renderBadge(value, "secondary") },
          { key: "ageDays", label: "Age (Days)", render: (value) => <span className="font-medium">{value}</span> },
          { key: "createdAt", label: "Created", render: (value) => formatDateTime(value) },
        ],
        summary: [
          { label: "Return Requests", value: formatNumeric(data?.total || rows.length) },
          ...(data?.buckets || []).slice(0, 3).map((bucket: any) => ({
            label: bucket?.bucket || "Unknown",
            value: formatNumeric(bucket?.count || 0),
          })),
        ],
        total: Number(data?.total || rows.length),
        isPaginated: true,
        emptyState: {
          title: "No return aging rows found.",
          description: "Adjust the office, status, or date filters and try again.",
        },
        exportFileName: "report-return-aging",
      };
    }
    case "analytics-trends": {
      const rows = (data?.data || []).flatMap((bucket: any, bucketIndex: number) =>
        (bucket?.series || []).map((series: any, seriesIndex: number) => ({
          id: `trend-${bucketIndex}-${seriesIndex}`,
          dateBucket: bucket?._id || "N/A",
          txType: series?.tx_type || "N/A",
          consumableItemId: series?.consumable_item_id || "N/A",
          qtyBase: Number(series?.qty_base || 0),
          count: Number(series?.count || 0),
        }))
      );
      const totalQty = rows.reduce((sum, row) => sum + Number(row.qtyBase || 0), 0);
      const totalEvents = rows.reduce((sum, row) => sum + Number(row.count || 0), 0);
      return {
        rows,
        columns: [
          { key: "dateBucket", label: "Date Bucket" },
          { key: "txType", label: "Transaction Type", render: (value) => renderBadge(value) },
          { key: "consumableItemId", label: "Consumable Item" },
          { key: "qtyBase", label: "Qty Base", render: (value) => <span className="font-medium">{formatNumeric(value)}</span> },
          { key: "count", label: "Transactions", render: (value) => <span className="font-medium">{formatNumeric(value)}</span> },
        ],
        summary: [
          { label: "Buckets", value: formatNumeric(data?.data?.length || 0) },
          { label: "Events", value: formatNumeric(totalEvents) },
          { label: "Total Qty", value: formatNumeric(totalQty) },
          { label: "Granularity", value: String(data?.granularity || "day") },
        ],
        total: rows.length,
        isPaginated: false,
        emptyState: {
          title: "No analytics trend rows found.",
          description: "Analytics trends require a valid from/to range and matching transactions.",
        },
        exportFileName: "report-analytics-trends",
      };
    }
    case "moveable-lifecycle": {
      const rows = (data?.timeline || []).map((event: any, index: number) => ({
        id: String(event?._id || `lifecycle-${index}`),
        eventType: event?.event_type || "N/A",
        eventDate: event?.event_date,
        status: event?.status || event?.maintenance_status || "N/A",
        detail:
          event?.assigned_to_type
            ? `${event.assigned_to_type}${event.assigned_to_id ? ` - ${event.assigned_to_id}` : ""}`
            : event?.maintenance_type || `${event?.from_office_id || ""}${event?.to_office_id ? ` -> ${event.to_office_id}` : ""}`.trim() || "N/A",
        notes: event?.notes || "N/A",
      }));
      return {
        rows,
        columns: [
          { key: "eventType", label: "Event Type", render: (value) => renderBadge(value) },
          { key: "eventDate", label: "Event Date", render: (value) => formatDateTime(value) },
          { key: "status", label: "Status", render: (value) => renderBadge(value, "secondary") },
          { key: "detail", label: "Detail" },
          { key: "notes", label: "Notes" },
        ],
        summary: [
          { label: "Assignments", value: formatNumeric(data?.counts?.assignments || 0) },
          { label: "Transfers", value: formatNumeric(data?.counts?.transfers || 0) },
          { label: "Maintenance", value: formatNumeric(data?.counts?.maintenanceRecords || 0) },
          { label: "Asset", value: String(data?.asset?.name || data?.assetItem?.tag || data?.assetItemId || "N/A") },
        ],
        total: rows.length,
        isPaginated: false,
        emptyState: {
          title: "No lifecycle events found for this asset item.",
          description: "Check the asset item ID or choose an item that has assignment, transfer, or maintenance history.",
        },
        exportFileName: "report-moveable-lifecycle",
      };
    }
    case "lot-lifecycle": {
      const rows = (data?.transactions || []).map((tx: any, index: number) => ({
        id: String(tx?._id || `lot-${index}`),
        txTime: tx?.tx_time,
        txType: tx?.tx_type || "N/A",
        fromHolder: resolveHolderLabel(tx?.from_holder_type, tx?.from_holder_id, officeNameById),
        toHolder: resolveHolderLabel(tx?.to_holder_type, tx?.to_holder_id, officeNameById),
        qtyBase: Number(tx?.qty_base || 0),
        enteredQty: `${formatNumeric(tx?.entered_qty || 0)} ${tx?.entered_uom || ""}`.trim(),
        reference: tx?.reference || "N/A",
      }));
      return {
        rows,
        columns: [
          { key: "txTime", label: "Transaction Time", render: (value) => formatDateTime(value) },
          { key: "txType", label: "Type", render: (value) => renderBadge(value) },
          { key: "fromHolder", label: "From Holder" },
          { key: "toHolder", label: "To Holder" },
          { key: "qtyBase", label: "Qty Base", render: (value) => <span className="font-medium">{formatNumeric(value)}</span> },
          { key: "enteredQty", label: "Entered Qty" },
          { key: "reference", label: "Reference" },
        ],
        summary: [
          { label: "Transactions", value: formatNumeric(data?.counts?.transactions || rows.length) },
          { label: "Lot", value: String(data?.lot?.batch_no || data?.lotId || "N/A") },
          { label: "Received", value: formatShortDate(data?.lot?.received_at) },
        ],
        total: rows.length,
        isPaginated: false,
        emptyState: {
          title: "No lot lifecycle transactions found.",
          description: "Check the lot ID or choose a lot with transaction history.",
        },
        exportFileName: "report-lot-lifecycle",
      };
    }
    case "assignment-trace": {
      const rows: ReportRow[] = [
        {
          id: "assignment",
          entity: "Assignment",
          identifier: data?.assignmentId || "N/A",
          status: (data?.assignment as any)?.status || "N/A",
          detail: (data?.assignment as any)?.assigned_to_type
            ? `${(data.assignment as any).assigned_to_type} - ${(data.assignment as any).assigned_to_id || "N/A"}`
            : "N/A",
          updatedAt: (data?.assignment as any)?.updated_at || (data?.assignment as any)?.assigned_date,
        },
        {
          id: "requisition",
          entity: "Requisition",
          identifier: (data?.requisition as any)?.file_number || (data?.requisition as any)?._id || "N/A",
          status: (data?.requisition as any)?.status || "N/A",
          detail: (data?.requisitionLine as any)?.requested_name || "N/A",
          updatedAt: (data?.requisition as any)?.updated_at || (data?.requisition as any)?.created_at,
        },
        {
          id: "asset-item",
          entity: "Asset Item",
          identifier: (data?.assetItem as any)?.tag || (data?.assetItem as any)?.serial_number || "N/A",
          status: (data?.assetItem as any)?.item_status || "N/A",
          detail: resolveHolderLabel((data?.assetItem as any)?.holder_type, (data?.assetItem as any)?.holder_id, officeNameById),
          updatedAt: (data?.assetItem as any)?.updated_at || "N/A",
        },
        {
          id: "return-request",
          entity: "Return Request",
          identifier: (data?.returnRequest as any)?._id || "None linked",
          status: (data?.returnRequest as any)?.status || "N/A",
          detail: (data?.returnRequest as any)?.receipt_document_id ? "Receipt uploaded" : "Receipt pending",
          updatedAt: (data?.returnRequest as any)?.updated_at || (data?.returnRequest as any)?.created_at || "N/A",
        },
      ];
      return {
        rows,
        columns: [
          { key: "entity", label: "Entity", render: (value) => renderBadge(value) },
          { key: "identifier", label: "Identifier" },
          { key: "status", label: "Status", render: (value) => renderBadge(value, "secondary") },
          { key: "detail", label: "Detail" },
          { key: "updatedAt", label: "Updated", render: (value) => formatDateTime(value) },
        ],
        summary: [
          { label: "Assignment", value: data?.assignmentId || "N/A" },
          { label: "Requisition", value: (data?.requisition as any)?.file_number || "N/A" },
          { label: "Return Linked", value: (data?.returnRequest as any)?._id ? "Yes" : "No" },
        ],
        total: rows.length,
        isPaginated: false,
        emptyState: {
          title: "No assignment trace found.",
          description: "Check the assignment ID or choose an assignment that exists.",
        },
        exportFileName: "report-assignment-trace",
      };
    }
  }

  return {
    rows: [],
    columns: [],
    summary: [],
    total: 0,
    isPaginated: false,
    emptyState: {
      title: "No report selected.",
      description: "Choose a report from the catalog to begin.",
    },
    exportFileName: "report-export",
  };
}

function getStatusOptions(reportId: ServerReportId) {
  if (reportId === "return-aging") return RETURN_STATUS_OPTIONS;
  return REQUISITION_STATUS_OPTIONS;
}

function reportNeedsDateRange(reportId: ServerReportId) {
  return [
    "inventory-snapshot-moveable",
    "moveable-assigned",
    "consumable-consumed",
    "requisitions",
    "requisition-aging",
    "return-aging",
    "analytics-trends",
  ].includes(reportId);
}

function reportNeedsCategory(reportId: ServerReportId) {
  return [
    "inventory-snapshot-moveable",
    "inventory-snapshot-consumable",
    "moveable-assigned",
    "consumable-assigned",
    "consumable-consumed",
    "analytics-trends",
  ].includes(reportId);
}

function reportNeedsHolder(reportId: ServerReportId) {
  return [
    "inventory-snapshot-moveable",
    "inventory-snapshot-consumable",
    "moveable-assigned",
    "consumable-assigned",
  ].includes(reportId);
}

function reportNeedsItemId(reportId: ServerReportId) {
  return ["consumable-assigned", "consumable-consumed", "analytics-trends"].includes(reportId);
}

function reportNeedsStatus(reportId: ServerReportId) {
  return ["requisitions", "requisition-aging", "return-aging"].includes(reportId);
}

export default function Reports() {
  const { isOrgAdmin, locationId } = useAuth();
  const { data: offices } = useLocations();
  const { data: categories } = useCategories();
  const [selectedReportId, setSelectedReportId] = useState<ServerReportId>(DEFAULT_REPORT_ID);
  const [draftFilters, setDraftFilters] = useState<ReportFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<ReportFilters>(DEFAULT_FILTERS);
  const [hasExecutedReport, setHasExecutedReport] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const { mode: catalogMode, setMode: setCatalogMode } = useViewMode("reports");
  const pageSearch = usePageSearch();
  const searchTerm = (pageSearch?.term || "").trim().toLowerCase();

  const reportMap = useMemo(
    () => new Map(REPORTS.map((report) => [report.id, report] as const)),
    [],
  );
  const selectedReport = reportMap.get(selectedReportId) || REPORTS[0];
  const officeNameById = useMemo(
    () => new Map((offices || []).map((office) => [office.id, office.name] as const)),
    [offices],
  );
  const categoryNameById = useMemo(
    () => new Map((categories || []).map((category) => [category.id, category.name] as const)),
    [categories],
  );

  const reportOptions = useMemo(
    () =>
      REPORTS.map((report) => ({
        value: report.id,
        label: report.title,
        keywords: `${report.description} ${report.category} ${report.endpoint}`,
      })),
    [],
  );
  const officeOptions = useMemo(
    () => [
      { value: "ALL", label: "All accessible offices" },
      ...((offices || []).map((office) => ({
        value: office.id,
        label: office.name,
      })) || []),
    ],
    [offices],
  );
  const categoryOptions = useMemo(
    () => [
      { value: "ALL", label: "All categories" },
      ...((categories || []).map((category) => ({
        value: category.id,
        label: category.name,
      })) || []),
    ],
    [categories],
  );
  const holderOptions = useMemo(
    () => (isOrgAdmin ? HOLDER_OPTIONS : HOLDER_OPTIONS.filter((option) => option.value !== "STORE")),
    [isOrgAdmin],
  );

  useEffect(() => {
    if (isOrgAdmin) return;
    if (draftFilters.holderType === "STORE" || draftFilters.consumptionMode === "central") {
      setDraftFilters((current) => ({
        ...current,
        holderType: current.holderType === "STORE" ? "ALL" : current.holderType,
        consumptionMode: "office",
      }));
    }
    if (appliedFilters.holderType === "STORE" || appliedFilters.consumptionMode === "central") {
      setAppliedFilters((current) => ({
        ...current,
        holderType: current.holderType === "STORE" ? "ALL" : current.holderType,
        consumptionMode: "office",
      }));
    }
  }, [isOrgAdmin, draftFilters.holderType, draftFilters.consumptionMode, appliedFilters.holderType, appliedFilters.consumptionMode]);

  const filteredReports = useMemo(
    () =>
      REPORTS.filter((report) => {
        if (!searchTerm) return true;
        return [report.title, report.description, report.category, report.endpoint]
          .join(" ")
          .toLowerCase()
          .includes(searchTerm);
      }),
    [searchTerm],
  );

  const scopedOfficeId = isOrgAdmin
    ? appliedFilters.officeId !== "ALL"
      ? appliedFilters.officeId
      : undefined
    : locationId || undefined;
  const scopedCategoryId = appliedFilters.categoryId !== "ALL" ? appliedFilters.categoryId : undefined;
  const scopedHolderType = appliedFilters.holderType !== "ALL" ? appliedFilters.holderType : undefined;
  const scopedStatus = appliedFilters.status !== "ALL" ? appliedFilters.status : undefined;

  const queryEnabled = useMemo(() => {
    if (selectedReportId === "analytics-trends") {
      return Boolean(appliedFilters.from && appliedFilters.to);
    }
    if (selectedReportId === "moveable-lifecycle") {
      return Boolean(toOptionalString(appliedFilters.assetItemId));
    }
    if (selectedReportId === "lot-lifecycle") {
      return Boolean(toOptionalString(appliedFilters.lotId));
    }
    if (selectedReportId === "assignment-trace") {
      return Boolean(toOptionalString(appliedFilters.assignmentId));
    }
    return true;
  }, [appliedFilters, selectedReportId]);

  const reportQuery = useQuery({
    queryKey: ["reports-console", selectedReportId, appliedFilters, page, pageSize, scopedOfficeId],
    enabled: hasExecutedReport && queryEnabled,
    queryFn: async () => {
      if (!hasExecutedReport || !queryEnabled) {
        return null;
      }
      switch (selectedReportId) {
        case "inventory-snapshot-moveable":
          return reportService.getInventorySnapshot({
            mode: "moveable",
            page,
            limit: pageSize,
            officeId: scopedOfficeId,
            categoryId: scopedCategoryId,
            holderType: scopedHolderType,
            holderId: toOptionalString(appliedFilters.holderId),
            from: appliedFilters.from || undefined,
            to: appliedFilters.to || undefined,
          });
        case "inventory-snapshot-consumable":
          return reportService.getInventorySnapshot({
            mode: "consumable",
            page,
            limit: pageSize,
            officeId: scopedOfficeId,
            categoryId: scopedCategoryId,
            holderType: scopedHolderType,
            holderId: toOptionalString(appliedFilters.holderId),
          });
        case "moveable-assigned":
          return reportService.getMoveableAssigned({
            page,
            limit: pageSize,
            officeId: scopedOfficeId,
            categoryId: scopedCategoryId,
            holderType: scopedHolderType,
            holderId: toOptionalString(appliedFilters.holderId),
            from: appliedFilters.from || undefined,
            to: appliedFilters.to || undefined,
          });
        case "consumable-assigned":
          return reportService.getConsumableAssigned({
            page,
            limit: pageSize,
            officeId: scopedOfficeId,
            categoryId: scopedCategoryId,
            holderType: scopedHolderType,
            holderId: toOptionalString(appliedFilters.holderId),
            itemId: toOptionalString(appliedFilters.itemId),
          });
        case "consumable-consumed":
          return reportService.getConsumableConsumed({
            page,
            limit: pageSize,
            officeId: scopedOfficeId,
            categoryId: scopedCategoryId,
            itemId: toOptionalString(appliedFilters.itemId),
            mode: appliedFilters.consumptionMode,
            from: appliedFilters.from || undefined,
            to: appliedFilters.to || undefined,
          });
        case "requisitions":
          return reportService.getRequisitions({
            page,
            limit: pageSize,
            officeId: scopedOfficeId,
            status: scopedStatus,
            from: appliedFilters.from || undefined,
            to: appliedFilters.to || undefined,
          });
        case "requisition-aging":
          return reportService.getRequisitionAging({
            page,
            limit: pageSize,
            officeId: scopedOfficeId,
            status: scopedStatus,
            from: appliedFilters.from || undefined,
            to: appliedFilters.to || undefined,
          });
        case "return-aging":
          return reportService.getReturnAging({
            page,
            limit: pageSize,
            officeId: scopedOfficeId,
            status: scopedStatus,
            from: appliedFilters.from || undefined,
            to: appliedFilters.to || undefined,
          });
        case "analytics-trends":
          return reportService.getAnalyticsTrends({
            officeId: scopedOfficeId,
            categoryId: scopedCategoryId,
            itemId: toOptionalString(appliedFilters.itemId),
            granularity: appliedFilters.granularity,
            from: appliedFilters.from,
            to: appliedFilters.to,
          });
        case "moveable-lifecycle":
          return reportService.getMoveableLifecycle(toOptionalString(appliedFilters.assetItemId)!);
        case "lot-lifecycle":
          return reportService.getLotLifecycle(toOptionalString(appliedFilters.lotId)!);
        case "assignment-trace":
          return reportService.getAssignmentTrace(toOptionalString(appliedFilters.assignmentId)!);
      }
    },
  });

  const presentation = useMemo(
    () => buildPresentation(selectedReportId, reportQuery.data, officeNameById, categoryNameById),
    [categoryNameById, officeNameById, reportQuery.data, selectedReportId],
  );

  const totalPages = Math.max(1, Math.ceil(Math.max(1, presentation.total) / pageSize));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const handleApplyFilters = () => {
    setAppliedFilters(draftFilters);
    setHasExecutedReport(true);
    setPage(1);
  };

  const handleResetFilters = () => {
    setDraftFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
    setHasExecutedReport(false);
    setPage(1);
  };

  const handleExport = () => {
    if (presentation.rows.length === 0) return;
    exportToCSV(
      presentation.rows as Record<string, unknown>[],
      presentation.columns.map((column) => ({
        key: column.key as keyof ReportRow,
        header: column.label,
        formatter: (value: unknown) => {
          if (column.key.toLowerCase().includes("date") || column.key.toLowerCase().includes("time")) {
            return formatDateTime(value);
          }
          return String(value ?? "");
        },
      })),
      presentation.exportFileName,
    );
  };

  const reportCatalogColumns: ReportColumn[] = [
    {
      key: "title",
      label: "Report",
      render: (_value, row) => (
        <div>
          <p className="font-medium">{String(row.title)}</p>
          <p className="max-w-[30rem] text-xs text-muted-foreground">
            {String(row.description)}
          </p>
        </div>
      ),
    },
    {
      key: "category",
      label: "Category",
      render: (value) => renderBadge(value, "secondary"),
    },
    {
      key: "endpoint",
      label: "Endpoint",
      render: (value) => <span className="font-mono text-xs">{String(value)}</span>,
    },
  ];

  return (
    <MainLayout title="Reports" description="Run backend-backed operational, aging, lifecycle, and analytics reports">
      <PageHeader
        title="Reports"
        description="Query the live reporting endpoints, preview the result set, and export the current report slice."
        eyebrow="Reporting workspace"
        meta={
          <>
            <span>{selectedReport.title}</span>
            <span className="hidden h-1 w-1 rounded-full bg-border sm:inline-block" />
            <span>{hasExecutedReport ? `${presentation.total} rows in current result` : "Ready to run"}</span>
          </>
        }
        extra={<ViewModeToggle mode={catalogMode} onModeChange={setCatalogMode} />}
      />

      <WorkflowPanel
        title="Report Catalog"
        description="Browse the available operational, lifecycle, and analytics reports, then switch into the one you want to run."
        className="mt-6"
      >
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="space-y-2">
              <Label htmlFor="report-selector">Active report</Label>
              <SearchableSelect
                id="report-selector"
                value={selectedReportId}
                onValueChange={(value) => {
                  setSelectedReportId(value as ServerReportId);
                  setHasExecutedReport(false);
                  setPage(1);
                }}
                options={reportOptions}
                placeholder="Select a report"
                searchPlaceholder="Search reports..."
                emptyText="No report matches found."
              />
            </div>
            <div className="rounded-[1.25rem] border border-border/70 bg-muted/25 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Active Endpoint
              </p>
              <p className="mt-2 font-mono text-sm leading-6 text-foreground">
                {selectedReport.endpoint}
              </p>
            </div>
          </div>

          {catalogMode === "list" ? (
            <DataTable
              columns={reportCatalogColumns}
              data={filteredReports as unknown as ReportRow[]}
              searchable={false}
              useGlobalPageSearch={false}
              exportable={false}
              filterable={false}
              actions={(row) => (
                <Button
                  type="button"
                  size="sm"
                  variant={row.id === selectedReportId ? "default" : "outline"}
                  onClick={() => {
                    setSelectedReportId(row.id as ServerReportId);
                    setHasExecutedReport(false);
                    setPage(1);
                  }}
                >
                  {row.id === selectedReportId ? "Active" : "Open"}
                </Button>
              )}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredReports.map((report) => {
                const Icon = report.icon;
                const isActive = report.id === selectedReportId;
                return (
                  <button
                    key={report.id}
                    type="button"
                    onClick={() => {
                      setSelectedReportId(report.id);
                      setHasExecutedReport(false);
                      setPage(1);
                    }}
                    className={cn(
                      "rounded-[1.5rem] border border-border/70 bg-white p-5 text-left shadow-[0_18px_48px_-40px_rgba(26,28,24,0.14)] transition-all hover:border-primary/35 hover:shadow-[0_24px_60px_-40px_rgba(72,112,48,0.22)]",
                      isActive && "border-primary/50 ring-1 ring-primary/25",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div
                        className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-2xl",
                          CATEGORY_COLORS[report.category] || "bg-muted text-foreground",
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <Badge variant={isActive ? "default" : "outline"}>
                        {isActive ? "Active" : report.category}
                      </Badge>
                    </div>
                    <h3 className="mt-4 font-semibold">{report.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{report.description}</p>
                    <p className="mt-3 font-mono text-[11px] text-muted-foreground">
                      {report.endpoint}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
      </WorkflowPanel>

      <WorkflowPanel
        title="Filters"
        description="Set the scope, dates, and identifiers for the selected report before running it."
        className="mt-6"
      >
          {!isOrgAdmin && locationId && (
            <Alert>
              <Activity className="h-4 w-4" />
              <AlertTitle>Office-scoped report access</AlertTitle>
              <AlertDescription>
                Results are limited to your assigned office: {resolveOfficeName(locationId, officeNameById)}.
              </AlertDescription>
            </Alert>
          )}

          <FilterBar>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {isOrgAdmin && (
              <div className="space-y-2">
                <Label>Office</Label>
                <SearchableSelect
                  value={draftFilters.officeId}
                  onValueChange={(value) => setDraftFilters((current) => ({ ...current, officeId: value }))}
                  options={officeOptions}
                  placeholder="All accessible offices"
                  searchPlaceholder="Search offices..."
                  emptyText="No offices found."
                />
              </div>
            )}

            {reportNeedsCategory(selectedReportId) && (
              <div className="space-y-2">
                <Label>Category</Label>
                <SearchableSelect
                  value={draftFilters.categoryId}
                  onValueChange={(value) => setDraftFilters((current) => ({ ...current, categoryId: value }))}
                  options={categoryOptions}
                  placeholder="All categories"
                  searchPlaceholder="Search categories..."
                  emptyText="No categories found."
                />
              </div>
            )}

            {reportNeedsHolder(selectedReportId) && (
              <>
                <div className="space-y-2">
                  <Label>Holder Type</Label>
                  <Select
                    value={draftFilters.holderType}
                    onValueChange={(value) => setDraftFilters((current) => ({ ...current, holderType: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All holder types" />
                    </SelectTrigger>
                    <SelectContent>
                      {holderOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Holder ID</Label>
                  <Input
                    value={draftFilters.holderId}
                    onChange={(event) => setDraftFilters((current) => ({ ...current, holderId: event.target.value }))}
                    placeholder="Optional holder ObjectId"
                  />
                </div>
              </>
            )}

            {reportNeedsItemId(selectedReportId) && (
              <div className="space-y-2">
                <Label>Consumable Item ID</Label>
                <Input
                  value={draftFilters.itemId}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, itemId: event.target.value }))}
                  placeholder="Optional consumable item ObjectId"
                />
              </div>
            )}

            {selectedReportId === "consumable-consumed" && (
              <div className="space-y-2">
                <Label>Mode</Label>
                <Select
                  value={draftFilters.consumptionMode}
                  onValueChange={(value) =>
                    setDraftFilters((current) => ({
                      ...current,
                      consumptionMode: value as ReportFilters["consumptionMode"],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select mode" />
                  </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="office">Office</SelectItem>
                      {isOrgAdmin ? <SelectItem value="central">Central Store</SelectItem> : null}
                    </SelectContent>
                  </Select>
                </div>
              )}

            {reportNeedsStatus(selectedReportId) && (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={draftFilters.status}
                  onValueChange={(value) => setDraftFilters((current) => ({ ...current, status: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    {getStatusOptions(selectedReportId).map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedReportId === "analytics-trends" && (
              <div className="space-y-2">
                <Label>Granularity</Label>
                <Select
                  value={draftFilters.granularity}
                  onValueChange={(value) =>
                    setDraftFilters((current) => ({
                      ...current,
                      granularity: value as ReportFilters["granularity"],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select granularity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Day</SelectItem>
                    <SelectItem value="week">Week</SelectItem>
                    <SelectItem value="month">Month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedReportId === "moveable-lifecycle" && (
              <div className="space-y-2">
                <Label>Asset Item ID</Label>
                <Input
                  value={draftFilters.assetItemId}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, assetItemId: event.target.value }))}
                  placeholder="Required asset item ObjectId"
                />
              </div>
            )}

            {selectedReportId === "lot-lifecycle" && (
              <div className="space-y-2">
                <Label>Lot ID</Label>
                <Input
                  value={draftFilters.lotId}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, lotId: event.target.value }))}
                  placeholder="Required lot ObjectId"
                />
              </div>
            )}

            {selectedReportId === "assignment-trace" && (
              <div className="space-y-2">
                <Label>Assignment ID</Label>
                <Input
                  value={draftFilters.assignmentId}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, assignmentId: event.target.value }))}
                  placeholder="Required assignment ObjectId"
                />
              </div>
            )}

            {reportNeedsDateRange(selectedReportId) && (
              <>
                <div className="space-y-2">
                  <Label>From</Label>
                  <Input
                    type="date"
                    value={draftFilters.from}
                    onChange={(event) => setDraftFilters((current) => ({ ...current, from: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>To</Label>
                  <Input
                    type="date"
                    value={draftFilters.to}
                    onChange={(event) => setDraftFilters((current) => ({ ...current, to: event.target.value }))}
                  />
                </div>
              </>
            )}
            </div>
          </FilterBar>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleApplyFilters}>
              Run Report
            </Button>
            <Button type="button" variant="outline" onClick={handleResetFilters}>
              Reset Filters
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleExport}
              disabled={presentation.rows.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              Export Current Rows
            </Button>
          </div>
      </WorkflowPanel>

      {!queryEnabled && (
        <Alert className="mt-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Report input required</AlertTitle>
          <AlertDescription>
            {selectedReportId === "analytics-trends"
              ? "Analytics Trends requires both a from and to date."
              : selectedReportId === "moveable-lifecycle"
                ? "Moveable Lifecycle requires an asset item ID."
                : selectedReportId === "lot-lifecycle"
                  ? "Lot Lifecycle requires a lot ID."
                  : "Assignment Trace requires an assignment ID."}
          </AlertDescription>
        </Alert>
      )}

      {!hasExecutedReport && (
        <Alert className="mt-6">
          <Activity className="h-4 w-4" />
          <AlertTitle>Ready to run</AlertTitle>
          <AlertDescription>
            Select a report, set any filters you need, and click Run Report to fetch live data.
          </AlertDescription>
        </Alert>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {presentation.summary.map((item, index) => (
          <StatsCard
            key={item.label}
            title={item.label}
            value={item.value}
            subtitle={item.note}
            icon={selectedReport.icon}
            variant={SUMMARY_CARD_VARIANTS[index % SUMMARY_CARD_VARIANTS.length]}
          />
        ))}
      </div>

      <WorkflowPanel
        title={selectedReport.title}
        description={selectedReport.description}
        className="mt-6"
        action={
          <Badge variant="outline" className="w-fit">
            {selectedReport.endpoint}
          </Badge>
        }
      >
          {!hasExecutedReport ? (
            <Alert>
              <Activity className="h-4 w-4" />
              <AlertTitle>No report run yet</AlertTitle>
              <AlertDescription>
                The preview table will populate after you run the selected report.
              </AlertDescription>
            </Alert>
          ) : reportQuery.isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : reportQuery.isError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Failed to load report</AlertTitle>
              <AlertDescription>
                {reportQuery.error instanceof Error ? reportQuery.error.message : "Unknown error"}
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <DataTable
                columns={presentation.columns}
                data={presentation.rows}
                pagination={false}
                pageSize={pageSize}
                pageSizeOptions={[10, 20, 50, 100]}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
                searchable={false}
                useGlobalPageSearch={false}
                filterable={false}
                exportable={false}
                emptyState={presentation.emptyState}
              />

              {presentation.isPaginated && (
                <div className="mt-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                  <p className="text-sm text-muted-foreground">
                    Showing {presentation.rows.length === 0 ? 0 : (page - 1) * pageSize + 1} to{" "}
                    {Math.min(page * pageSize, presentation.total)} of {presentation.total} results
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                      disabled={page === 1}
                    >
                      Previous
                    </Button>
                    <span className="text-sm font-medium">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                      disabled={page >= totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
      </WorkflowPanel>
    </MainLayout>
  );
}
