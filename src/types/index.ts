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
  Admin = "Admin",
  Manager = "Manager",
  LocationAdmin = "LocationAdmin",
  User = "User",
  Employee = "Employee",
  DirectorateHead = "DirectorateHead",
  Viewer = "Viewer",
}

// Core Entities - Using snake_case to match Supabase
export interface Category {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Office {
  id: string;
  name: string;
  division: string | null;
  district: string | null;
  address: string | null;
  contact_number: string | null;
  type?: "CENTRAL" | "LAB" | "SUBSTORE";
  parent_location_id?: string | null;
  lab_code?: string | null;
  is_active?: boolean | null;
  created_at: string;
  updated_at: string;
}

export type Location = Office;
export type Directorate = Office;

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

export interface TransferHistory {
  id: string;
  asset_item_id: string;
  from_location_id: string | null;
  to_location_id: string;
  transfer_date: string;
  reason: string | null;
  performed_by: string | null;
  created_at: string;
  asset_items?: AssetItem | null;
  from_location?: Location | null;
  to_location?: Location | null;
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

export type ConsumableBaseUom = "g" | "mg" | "kg" | "mL" | "L";

export interface ConsumableItem {
  id: string;
  name: string;
  cas_number: string | null;
  category_id: string | null;
  base_uom: ConsumableBaseUom;
  is_hazardous: boolean;
  is_controlled: boolean;
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
  location_id: string;
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
  from_location_id: string | null;
  to_location_id: string | null;
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
}

export interface ConsumableExpiryRow {
  lotId: string;
  itemId: string;
  locationId: string;
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
  render?: (value: any, row: T) => React.ReactNode;
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
