// Asset Management System - Core Types & Interfaces
// Updated to use snake_case to match Supabase database schema

// Enums
export enum AssignmentStatus {
  Unassigned = "Unassigned",
  Assigned = "Assigned",
  InTransit = "InTransit",
}

export enum AssetStatus {
  Available = "Available",
  Assigned = "Assigned",
  Maintenance = "Maintenance",
  Damaged = "Damaged",
  Retired = "Retired",
  InTransit = "InTransit",
}

export type ItemStatus = AssetStatus;
export const ItemStatus = AssetStatus;

export enum AssetCondition {
  New = "New",
  Good = "Good",
  Fair = "Fair",
  Poor = "Poor",
  Damaged = "Damaged",
}

export enum FunctionalStatus {
  Functional = "Functional",
  NeedRepairs = "Need Repairs",
  Dead = "Dead",
}

export enum ItemSource {
  Purchased = "Purchased",
  Donated = "Donated",
  Leased = "Leased",
  Transferred = "Transferred",
}

export enum MaintenanceType {
  Preventive = "Preventive",
  Corrective = "Corrective",
  Emergency = "Emergency",
  Inspection = "Inspection",
}

export enum MaintenanceStatus {
  Scheduled = "Scheduled",
  InProgress = "InProgress",
  Completed = "Completed",
  Cancelled = "Cancelled",
}

export enum PurchaseOrderStatus {
  Draft = "Draft",
  Pending = "Pending",
  Approved = "Approved",
  Received = "Received",
  Cancelled = "Cancelled",
}

export enum UserRole {
  OrgAdmin = "org_admin",
  OfficeHead = "office_head",
  Caretaker = "caretaker",
  Employee = "employee",
}

export type CategoryScope = "GENERAL" | "LAB_ONLY";

// Core Entities - Using snake_case to match Supabase
export interface Category {
  id: string;
  name: string;
  description: string | null;
  scope?: CategoryScope | null;
  created_at: string;
  updated_at: string;
}

export type OfficeType = "DIRECTORATE" | "DISTRICT_OFFICE" | "DISTRICT_LAB";

export interface Office {
  id: string;
  name: string;
  division: string | null;
  district: string | null;
  address: string | null;
  contact_number: string | null;
  // Keep a string fallback so legacy values from existing data do not break UI.
  type?: OfficeType | string | null;
  parent_office_id?: string | null;
  // Deprecated: kept for backward compatibility during migration.
  parent_location_id?: string | null;
  lab_code?: string | null;
  capabilities?: {
    moveables?: boolean;
    consumables?: boolean;
    chemicals?: boolean;
  } | null;
  is_headoffice?: boolean | null;
  is_active?: boolean | null;
  created_at: string;
  updated_at: string;
}

export type Location = Office;
export type Directorate = Office;

export interface Division {
  id: string;
  name: string;
  is_active?: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface District {
  id: string;
  name: string;
  division_id: string | null;
  is_active?: boolean | null;
  created_at: string;
  updated_at: string;
  divisions?: Division | null;
}

export interface Vendor {
  id: string;
  name: string;
  contact_info: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  budget: number | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface Scheme {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
  projects?: Project | null;
}

export interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  user_id?: string | null;
  phone: string | null;
  job_title: string | null;
  hire_date: string | null;
  directorate_id: string | null;
  location_id: string | null;
  transferred_at?: string | null;
  transferred_from_office_id?: string | null;
  transferred_to_office_id?: string | null;
  transfer_reason?: string | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
  directorates?: Directorate | null;
  locations?: Location | null;
}

export interface PurchaseOrder {
  id: string;
  order_number: string;
  order_date: string;
  expected_delivery_date: string | null;
  delivered_date: string | null;
  total_amount: number;
  vendor_id: string | null;
  project_id: string | null;
  status: PurchaseOrderStatus | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  vendors?: Vendor | null;
  projects?: Project | null;
}

// Partial types for relations (Supabase joins return subset of fields)
export interface CategoryPartial {
  id: string;
  name: string;
  description: string | null;
  scope?: CategoryScope | null;
}

export interface VendorPartial {
  id: string;
  name: string;
}

export interface ProjectPartial {
  id: string;
  name: string;
}

export interface Asset {
  id: string;
  name: string;
  description: string | null;
  specification?: string | null;
  category_id: string | null;
  vendor_id: string | null;
  purchase_order_id: string | null;
  project_id: string | null;
  asset_source: "procurement" | "project" | null;
  scheme_id: string | null;
  acquisition_date: string | null;
  unit_price: number | null;
  currency: string | null;
  quantity: number | null;
  dimensions?: {
    length: number | null;
    width: number | null;
    height: number | null;
    unit: "mm" | "cm" | "m" | "in";
  } | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
  categories?: CategoryPartial | null;
  vendors?: VendorPartial | null;
  projects?: ProjectPartial | null;
}

export interface AssetItem {
  id: string;
  asset_id: string;
  holder_type?: "OFFICE" | "STORE" | null;
  holder_id?: string | null;
  location_id: string | null;
  serial_number: string | null;
  tag: string | null;
  assignment_status: AssignmentStatus | null;
  item_status: AssetStatus | null;
  item_condition: AssetCondition | null;
  functional_status?: FunctionalStatus | string | null;
  item_source: ItemSource | null;
  purchase_date: string | null;
  warranty_expiry: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  assets?: Asset | null;
  locations?: Location | null;
}

export interface Assignment {
  id: string;
  asset_item_id: string;
  employee_id: string;
  assigned_date: string;
  expected_return_date: string | null;
  returned_date: string | null;
  notes: string | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
  asset_items?: AssetItem | null;
  employees?: Employee | null;
}

export interface MaintenanceRecord {
  id: string;
  asset_item_id: string;
  maintenance_type: MaintenanceType | null;
  maintenance_status: MaintenanceStatus | null;
  description: string | null;
  cost: number | null;
  performed_by: string | null;
  scheduled_date: string | null;
  completed_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  asset_items?: AssetItem | null;
}

export type TransferStatus =
  | "REQUESTED"
  | "APPROVED"
  | "DISPATCHED_TO_STORE"
  | "RECEIVED_AT_STORE"
  | "DISPATCHED_TO_DEST"
  | "RECEIVED_AT_DEST"
  | "REJECTED"
  | "CANCELLED";

export interface TransferLine {
  asset_item_id: string;
  notes?: string | null;
}

export interface Transfer {
  id: string;
  asset_item_id?: string | null;
  lines: TransferLine[];
  from_office_id: string;
  to_office_id: string;
  store_id?: string | null;
  handover_document_id?: string | null;
  takeover_document_id?: string | null;
  transfer_date: string;
  handled_by: string | null;
  status: TransferStatus;
  notes: string | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
}

export enum RequisitionStatus {
  PendingVerification = "PENDING_VERIFICATION",
  VerifiedApproved = "VERIFIED_APPROVED",
  InFulfillment = "IN_FULFILLMENT",
  PartiallyFulfilled = "PARTIALLY_FULFILLED",
  FulfilledPendingSignature = "FULFILLED_PENDING_SIGNATURE",
  Fulfilled = "FULFILLED",
  RejectedInvalid = "REJECTED_INVALID",
  Cancelled = "CANCELLED",
}

export enum RequisitionLineType {
  Moveable = "MOVEABLE",
  Consumable = "CONSUMABLE",
}

export enum RequisitionLineStatus {
  PendingAssignment = "PENDING_ASSIGNMENT",
  Assigned = "ASSIGNED",
  PartiallyAssigned = "PARTIALLY_ASSIGNED",
  NotAvailable = "NOT_AVAILABLE",
  Cancelled = "CANCELLED",
}

export interface Requisition {
  id: string;
  _id?: string;
  file_number: string;
  office_id: string;
  issuing_office_id: string;
  requested_by_employee_id: string | null;
  submitted_by_user_id: string;
  fulfilled_by_user_id: string | null;
  record_id: string | null;
  signed_issuance_document_id: string | null;
  signed_issuance_uploaded_at: string | null;
  attachment_file_name: string | null;
  attachment_mime_type: string | null;
  attachment_size_bytes: number | null;
  attachment_path: string | null;
  status: RequisitionStatus;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface RequisitionLine {
  id: string;
  _id?: string;
  requisition_id: string;
  line_type: RequisitionLineType;
  requested_name: string;
  requested_quantity: number;
  approved_quantity: number;
  fulfilled_quantity: number;
  status: RequisitionLineStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export enum ReturnRequestStatus {
  Submitted = "SUBMITTED",
  ReceivedConfirmed = "RECEIVED_CONFIRMED",
  ClosedPendingSignature = "CLOSED_PENDING_SIGNATURE",
  Closed = "CLOSED",
  Rejected = "REJECTED",
}

export interface ReturnRequestLine {
  asset_item_id: string;
}

export interface ReturnRequest {
  id: string;
  _id?: string;
  employee_id: string;
  office_id: string;
  record_id: string | null;
  receipt_document_id: string | null;
  status: ReturnRequestStatus;
  lines: ReturnRequestLine[];
  created_at: string;
  updated_at: string;
}

export type RecordType = "ISSUE" | "RETURN" | "TRANSFER" | "MAINTENANCE" | "DISPOSAL" | "INCIDENT";
export type RecordStatus = "Draft" | "PendingApproval" | "Approved" | "Completed" | "Rejected" | "Cancelled" | "Archived";

export interface RecordEntry {
  id: string;
  record_type: RecordType;
  reference_no: string;
  office_id: string;
  status: RecordStatus;
  created_by_user_id: string;
  asset_item_id?: string | null;
  employee_id?: string | null;
  assignment_id?: string | null;
  transfer_id?: string | null;
  maintenance_record_id?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export type DocumentType =
  | "IssueSlip"
  | "ReturnSlip"
  | "TransferChallan"
  | "MaintenanceJobCard"
  | "Warranty"
  | "Invoice"
  | "DisposalApproval"
  | "IncidentReport"
  | "Other";

export type DocumentStatus = "Draft" | "Final" | "Archived";

export interface DocumentRecord {
  id: string;
  title: string;
  doc_type: DocumentType;
  status: DocumentStatus;
  office_id: string;
  created_by_user_id?: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  version_no: number;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  file_path?: string | null;
  file_url?: string | null;
  uploaded_by_user_id?: string;
  uploaded_at: string;
  created_at?: string;
  updated_at?: string;
}

export type DocumentLinkEntityType = "Record" | "AssetItem" | "Assignment" | "Transfer" | "MaintenanceRecord";

export interface DocumentLink {
  id: string;
  document_id: string;
  entity_type: DocumentLinkEntityType;
  entity_id: string;
  required_for_status?: "PendingApproval" | "Approved" | "Completed" | null;
  created_at?: string;
  updated_at?: string;
}

export type ApprovalStatus = "Pending" | "Approved" | "Rejected" | "Cancelled";

export interface ApprovalRequest {
  id: string;
  record_id: string;
  requested_by_user_id: string;
  approver_user_id?: string | null;
  approver_role?: string | null;
  status: ApprovalStatus;
  requested_at: string;
  decided_at?: string | null;
  decision_notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AuditLogEntry {
  id: string;
  actor_user_id: string;
  office_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  timestamp: string;
  diff?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

export interface RecordDocumentView {
  document: DocumentRecord | null;
  versions: DocumentVersion[];
  links: DocumentLink[];
}

export interface RecordDetailResponse {
  record: RecordEntry;
  documents: RecordDocumentView[];
  approvals: ApprovalRequest[];
  auditLogs: AuditLogEntry[];
  missingRequirements: string[];
}

export type ConsumableAssigneeType = "employee" | "location";

export interface ConsumableAsset {
  id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  unit: string;
  total_quantity: number;
  available_quantity: number;
  acquisition_date: string | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
  categories?: CategoryPartial | null;
}

export interface ConsumableAssignment {
  id: string;
  consumable_id: string;
  assignee_type: ConsumableAssigneeType;
  assignee_id: string;
  received_by_employee_id?: string | null;
  quantity: number;
  input_quantity: number | null;
  input_unit: string | null;
  assigned_date: string;
  notes: string | null;
  created_at: string;
  consumables?: ConsumableAsset | null;
}

export interface ConsumableUnit {
  id: string;
  code: string;
  name: string;
  group: "mass" | "volume" | "count";
  to_base: number;
  aliases?: string[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type ConsumableBaseUom = string;

export interface ConsumableItem {
  id: string;
  name: string;
  cas_number: string | null;
  category_id: string | null;
  base_uom: ConsumableBaseUom;
  is_hazardous: boolean;
  is_controlled: boolean;
  is_chemical?: boolean | null;
  requires_lot_tracking: boolean;
  requires_container_tracking: boolean;
  default_min_stock: number | null;
  default_reorder_point: number | null;
  storage_condition: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  categories?: CategoryPartial | null;
}

export interface ConsumableSupplier {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConsumableLot {
  id: string;
  consumable_item_id: string;
  supplier_id: string | null;
  lot_number: string;
  received_date: string;
  expiry_date: string | null;
  docs?: {
    sds_url?: string | null;
    coa_url?: string | null;
    invoice_url?: string | null;
  } | null;
  created_at: string;
  updated_at: string;
}

export interface ConsumableContainer {
  id: string;
  lot_id: string;
  container_code: string;
  initial_qty_base: number;
  current_qty_base: number;
  current_location_id: string;
  status: "IN_STOCK" | "EMPTY" | "DISPOSED" | "LOST";
  opened_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConsumableInventoryBalance {
  id: string;
  holder_type?: 'OFFICE' | 'STORE' | null;
  holder_id?: string | null;
  location_id?: string | null;
  consumable_item_id: string;
  lot_id: string | null;
  qty_on_hand_base: number;
  qty_reserved_base: number;
  created_at: string;
  updated_at: string;
}

export interface ConsumableInventoryTransaction {
  id: string;
  tx_type: "RECEIPT" | "TRANSFER" | "CONSUME" | "ADJUST" | "DISPOSE" | "RETURN" | "OPENING_BALANCE";
  tx_time: string;
  created_by: string;
  from_holder_type?: 'OFFICE' | 'STORE' | null;
  from_holder_id?: string | null;
  to_holder_type?: 'OFFICE' | 'STORE' | null;
  to_holder_id?: string | null;
  from_location_id?: string | null;
  to_location_id?: string | null;
  consumable_item_id: string;
  lot_id: string | null;
  container_id: string | null;
  qty_base: number;
  entered_qty: number;
  entered_uom: string;
  reason_code_id: string | null;
  reference: string | null;
  notes: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ConsumableReasonCode {
  id: string;
  category: "ADJUST" | "DISPOSE";
  code: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConsumableRollupRow {
  itemId: string;
  totalQtyBase: number;
  byLocation: Array<{ locationId: string; qtyOnHandBase: number }>;
  byHolder?: Array<{ holderType: 'OFFICE' | 'STORE'; holderId: string; qtyOnHandBase: number }>;
}

export interface ConsumableExpiryRow {
  lotId: string;
  itemId: string;
  holderType?: 'OFFICE' | 'STORE' | null;
  holderId?: string | null;
  locationId?: string | null;
  expiryDate: string;
  qtyOnHandBase: number;
}

// Dashboard & Reporting Types
export interface DashboardStats {
  totalAssets: number;
  totalAssetItems: number;
  assignedItems: number;
  availableItems: number;
  maintenanceItems: number;
  totalValue: number;
  recentAssignments: number;
  pendingPurchaseOrders: number;
  lowStockAlerts: number;
}

export interface AssetSummary {
  categoryId: string;
  categoryName: string;
  totalItems: number;
  assignedItems: number;
  availableItems: number;
  totalValue: number;
}

export interface LocationSummary {
  locationId: string;
  locationName: string;
  totalItems: number;
  totalValue: number;
}

export interface SystemSettings {
  id: string;
  organization: {
    name: string;
    code: string;
    address: string;
    email: string;
    phone: string;
  };
  notifications: {
    low_stock_alerts: boolean;
    maintenance_reminders: boolean;
    assignment_notifications: boolean;
    warranty_expiry_alerts: boolean;
  };
  security: {
    two_factor_required: boolean;
    session_timeout_minutes: number;
    audit_logging: boolean;
  };
  last_backup_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SystemInfo {
  version: string;
  last_backup_at: string | null;
  database_status: string;
  storage_used_bytes: number | null;
  storage_limit_bytes: number | null;
  api_base_url: string;
}

// UI Helper Types
export interface TableColumn<T> {
  key: keyof T | string;
  label: string;
  sortable?: boolean;
  render?: (value: unknown, row: T) => React.ReactNode;
}

export interface FilterOption {
  label: string;
  value: string;
}

export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
}
