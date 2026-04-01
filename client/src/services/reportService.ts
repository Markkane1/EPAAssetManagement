import api from '@/lib/api';

function toQueryString(params?: Record<string, unknown>) {
  if (!params) return '';
  const query = Object.entries(params).reduce<Record<string, string>>((acc, [key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      acc[key] = String(value);
    }
    return acc;
  }, {});
  const encoded = new URLSearchParams(query).toString();
  return encoded ? `?${encoded}` : '';
}

export interface NonComplianceReportParams {
  officeId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface NonComplianceReportResponse {
  page: number;
  limit: number;
  total: number;
  officeId: string | null;
  counts: {
    requisitionsWithoutSignedIssueSlip: number;
    returnRequestsWithoutSignedReturnSlip: number;
    total: number;
  };
  items: Array<{
    type: 'REQUISITION' | 'RETURN_REQUEST';
    issue: 'MISSING_SIGNED_ISSUE_SLIP' | 'MISSING_SIGNED_RETURN_SLIP';
    id: string;
    office_id: string;
    status: string;
    file_number?: string;
    signed_document_id: string | null;
    created_at: string;
    updated_at: string;
  }>;
}

export interface PaginatedParams {
  officeId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  page: number;
  limit: number;
  total: number;
  officeId: string | null;
  items: T[];
}

export interface InventorySnapshotParams extends PaginatedParams {
  mode?: 'moveable' | 'consumable';
  officeType?: string;
  categoryId?: string;
  holderType?: string;
  holderId?: string;
}

export interface InventorySnapshotGroup {
  _id: { category_id: string; holder_type: string; holder_id: string; consumable_item_id?: string };
  count?: number;
  qty_on_hand_base?: number;
  item_name?: string;
  items?: Array<{ _id: string; asset_id: string; serial_number: string | null; tag: string | null; assignment_status: string; item_status: string }>;
}

export interface MoveableAssignedParams extends PaginatedParams {
  holderType?: string;
  holderId?: string;
  categoryId?: string;
}

export interface MoveableAssignedItem {
  _id: string;
  asset_id: string;
  serial_number: string | null;
  tag: string | null;
  asset_name: string;
  category_id: string;
  holder_type: string;
  holder_id: string;
  assignment_status: string;
  item_status: string;
  assigned_to_type: string;
  assigned_to_id: string;
  assigned_date: string;
  assignment_id: string;
  assignment_workflow_status: string;
}

export interface ConsumableAssignedParams extends PaginatedParams {
  holderType?: string;
  holderId?: string;
  categoryId?: string;
  itemId?: string;
}

export interface ConsumableAssignedItem {
  _id: string;
  holder_type: string;
  holder_id: string;
  consumable_item_id: string;
  lot_id: string | null;
  qty_on_hand_base: number;
  qty_reserved_base: number;
  item_name: string;
  base_uom: string;
  category_id: string;
  is_controlled: boolean;
}

export interface ConsumableConsumedParams extends PaginatedParams {
  mode?: 'office' | 'central';
  categoryId?: string;
  itemId?: string;
}

export interface ConsumableConsumedItem {
  _id: string;
  tx_type: string;
  tx_time: string;
  from_holder_type: string;
  from_holder_id: string;
  consumable_item_id: string;
  lot_id: string | null;
  qty_base: number;
  entered_qty: number;
  entered_uom: string;
  reference: string | null;
  notes: string | null;
  item_name: string;
  base_uom: string;
  category_id: string;
  created_at: string;
}

export interface ConsumableConsumedResponse extends PaginatedResponse<ConsumableConsumedItem> {
  totalQtyBase: number;
  mode: string;
}

export interface MoveableLifecycleEvent {
  event_type: 'ASSIGNMENT' | 'TRANSFER' | 'MAINTENANCE';
  event_date: string;
  _id: string;
  status?: string;
  assigned_to_type?: string;
  assigned_to_id?: string;
  returned_date?: string | null;
  from_office_id?: string;
  to_office_id?: string;
  maintenance_type?: string;
  maintenance_status?: string;
  completed_date?: string | null;
  notes?: string | null;
}

export interface MoveableLifecycleResponse {
  assetItemId: string;
  assetItem: Record<string, unknown>;
  asset: { _id: string; name: string; category_id: string; description: string | null } | null;
  timeline: MoveableLifecycleEvent[];
  counts: { assignments: number; transfers: number; maintenanceRecords: number };
}

export interface LotLifecycleResponse {
  lotId: string;
  lot: Record<string, unknown>;
  transactions: Array<{
    _id: string;
    tx_type: string;
    tx_time: string;
    from_holder_type: string | null;
    from_holder_id: string | null;
    to_holder_type: string | null;
    to_holder_id: string | null;
    qty_base: number;
    entered_qty: number;
    entered_uom: string;
    reference: string | null;
    notes: string | null;
    created_at: string;
  }>;
  counts: { transactions: number };
}

export interface AssignmentTraceResponse {
  assignmentId: string;
  assignment: Record<string, unknown>;
  requisition: Record<string, unknown> | null;
  requisitionLine: Record<string, unknown> | null;
  assetItem: Record<string, unknown> | null;
  returnRequest: Record<string, unknown> | null;
}

export interface AgingReportParams extends PaginatedParams {
  status?: string;
}

export interface AgingBucket {
  bucket: string;
  count: number;
}

export interface AgingReportResponse extends PaginatedResponse<Record<string, unknown>> {
  buckets: AgingBucket[];
}

export interface RequisitionReportParams extends PaginatedParams {
  status?: string;
}

export interface RequisitionReportItem {
  id: string;
  file_number: string;
  office_id: string;
  issuing_office_id: string;
  status: string;
  target_type?: string | null;
  target_id?: string | null;
  requested_by_employee_id: string | null;
  submitted_by_user_id: string;
  fulfilled_by_user_id: string | null;
  record_id: string | null;
  signed_issuance_document_id: string | null;
  signed_issuance_uploaded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RequisitionReportResponse extends PaginatedResponse<RequisitionReportItem> {
  statusSummary: Array<{
    status: string;
    count: number;
  }>;
}

export interface AnalyticsTrendsParams {
  from: string;
  to: string;
  officeId?: string;
  categoryId?: string;
  itemId?: string;
  granularity?: 'day' | 'week' | 'month';
}

export interface AnalyticsTrendsSeries {
  tx_type: string;
  consumable_item_id: string;
  qty_base: number;
  count: number;
}

export interface AnalyticsTrendsResponse {
  from: string;
  to: string;
  granularity: string;
  officeId: string | null;
  data: Array<{ _id: string; series: AnalyticsTrendsSeries[] }>;
}

export const reportService = {
  getNonCompliance: (params?: NonComplianceReportParams) =>
    api.get<NonComplianceReportResponse>(`/reports/noncompliance${toQueryString(params)}`),

  getInventorySnapshot: (params?: InventorySnapshotParams) =>
    api.get<PaginatedResponse<InventorySnapshotGroup>>(`/reports/inventory-snapshot${toQueryString(params)}`),

  getMoveableAssigned: (params?: MoveableAssignedParams) =>
    api.get<PaginatedResponse<MoveableAssignedItem>>(`/reports/moveable-assigned${toQueryString(params)}`),

  getConsumableAssigned: (params?: ConsumableAssignedParams) =>
    api.get<PaginatedResponse<ConsumableAssignedItem>>(`/reports/consumable-assigned${toQueryString(params)}`),

  getConsumableConsumed: (params?: ConsumableConsumedParams) =>
    api.get<ConsumableConsumedResponse>(`/reports/consumable-consumption${toQueryString(params)}`),

  getMoveableLifecycle: (assetItemId: string) =>
    api.get<MoveableLifecycleResponse>(`/reports/moveable-lifecycle/${assetItemId}`),

  getLotLifecycle: (lotId: string) =>
    api.get<LotLifecycleResponse>(`/reports/lot-lifecycle/${lotId}`),

  getAssignmentTrace: (assignmentId: string) =>
    api.get<AssignmentTraceResponse>(`/reports/assignment-trace/${assignmentId}`),

  getRequisitionAging: (params?: AgingReportParams) =>
    api.get<AgingReportResponse>(`/reports/requisition-aging${toQueryString(params)}`),

  getReturnAging: (params?: AgingReportParams) =>
    api.get<AgingReportResponse>(`/reports/return-aging${toQueryString(params)}`),

  getRequisitions: (params?: RequisitionReportParams) =>
    api.get<RequisitionReportResponse>(`/reports/requisitions${toQueryString(params)}`),

  getAnalyticsTrends: (params: AnalyticsTrendsParams) =>
    api.get<AnalyticsTrendsResponse>(`/reports/analytics-trends${toQueryString(params as unknown as Record<string, unknown>)}`),
};

export default reportService;
