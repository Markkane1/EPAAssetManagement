export type DecisionPriority = 'P0' | 'P1' | 'P2';

export type ReportBlueprint = {
  key: string;
  title: string;
  description: string;
  priority: DecisionPriority;
  apiPath: string;
  requiredFilters: string[];
};

export const REPORT_BLUEPRINTS: ReportBlueprint[] = [
  {
    key: 'inventory_snapshot',
    title: 'Office/Lab/Directorate Inventory Snapshot',
    description: 'Dated inventory split by category, holder, and items.',
    priority: 'P0',
    apiPath: '/api/reports/inventory-snapshot',
    requiredFilters: ['from', 'to', 'officeType', 'officeId', 'categoryId', 'holderType', 'holderId', 'mode'],
  },
  {
    key: 'moveable_assigned',
    title: 'Moveable Assigned Report',
    description: 'Assignments grouped by employee/section/office with current status.',
    priority: 'P0',
    apiPath: '/api/reports/moveable-assigned',
    requiredFilters: ['from', 'to', 'officeId', 'holderType', 'holderId', 'categoryId'],
  },
  {
    key: 'consumable_assigned',
    title: 'Consumable Assigned Balance Report',
    description: 'Current consumable balances by holder and location scope.',
    priority: 'P0',
    apiPath: '/api/reports/consumable-assigned',
    requiredFilters: ['from', 'to', 'officeId', 'holderType', 'holderId', 'categoryId', 'itemId'],
  },
  {
    key: 'consumable_consumed',
    title: 'Consumables Consumed (Office/Central)',
    description: 'Consumption flow and quantities by office and central store.',
    priority: 'P0',
    apiPath: '/api/reports/consumable-consumption',
    requiredFilters: ['from', 'to', 'officeId', 'mode', 'categoryId', 'itemId'],
  },
  {
    key: 'moveable_lifecycle',
    title: 'Individual Moveable Asset Lifecycle',
    description: 'Full timeline for a specific moveable asset item.',
    priority: 'P0',
    apiPath: '/api/reports/moveable-lifecycle/:assetItemId',
    requiredFilters: ['assetItemId'],
  },
  {
    key: 'lot_lifecycle',
    title: 'Moveable/Consumable Lot Lifecycle',
    description: 'Receiving, transfers, assignments/consumption, and closure timeline.',
    priority: 'P1',
    apiPath: '/api/reports/lot-lifecycle/:lotId',
    requiredFilters: ['lotId'],
  },
  {
    key: 'assignment_trace',
    title: 'Assignment Trace',
    description: 'Requisition to fulfillment to return trace for assignment records.',
    priority: 'P1',
    apiPath: '/api/reports/assignment-trace/:assignmentId',
    requiredFilters: ['assignmentId'],
  },
  {
    key: 'requisition_aging',
    title: 'Requisition SLA and Aging',
    description: 'Aging buckets and SLA breaches by office and workflow stage.',
    priority: 'P1',
    apiPath: '/api/reports/requisition-aging',
    requiredFilters: ['from', 'to', 'officeId', 'status'],
  },
  {
    key: 'return_aging',
    title: 'Return Request Aging',
    description: 'Pending signature and closure aging for return requests.',
    priority: 'P1',
    apiPath: '/api/reports/return-aging',
    requiredFilters: ['from', 'to', 'officeId', 'status'],
  },
  {
    key: 'analytics_trends',
    title: 'Consumption and Transfer Trends',
    description: 'Time-series analytics for consumables and asset movements.',
    priority: 'P2',
    apiPath: '/api/reports/analytics-trends',
    requiredFilters: ['from', 'to', 'officeId', 'categoryId', 'itemId'],
  },
];

export type AuditBlueprint = {
  key: string;
  title: string;
  description: string;
  requiredFields: string[];
  priority: DecisionPriority;
};

export const AUDIT_EVENT_BLUEPRINTS: AuditBlueprint[] = [
  {
    key: 'auth_events',
    title: 'Authentication and Authorization',
    description: 'Login, logout, failed auth, permission denials.',
    requiredFields: ['event_type', 'actor_user_id', 'actor_role', 'status', 'ip_address', 'user_agent'],
    priority: 'P0',
  },
  {
    key: 'master_data_changes',
    title: 'Master Data Changes',
    description: 'Division/district/office/category/vendor/project/scheme CRUD events.',
    requiredFields: ['entity_type', 'entity_id', 'action', 'before', 'after', 'changed_fields'],
    priority: 'P0',
  },
  {
    key: 'asset_lifecycle_events',
    title: 'Asset and Consumable Lifecycle',
    description: 'Receive, assign, transfer, consume, adjust, dispose, return.',
    requiredFields: ['entity_type', 'entity_id', 'office_id', 'action', 'status', 'request_id'],
    priority: 'P0',
  },
  {
    key: 'workflow_transitions',
    title: 'Workflow Transitions',
    description: 'Requisition/return state transitions and approvals.',
    requiredFields: ['entity_type', 'entity_id', 'action', 'before', 'after', 'reason'],
    priority: 'P0',
  },
  {
    key: 'document_chain_events',
    title: 'Document Chain',
    description: 'Issuance/return signed upload and document-link integrity events.',
    requiredFields: ['entity_type', 'entity_id', 'action', 'status', 'request_id'],
    priority: 'P1',
  },
  {
    key: 'report_generation_events',
    title: 'Report Generation',
    description: 'Track report type, filters, exporter, and file format.',
    requiredFields: ['event_type', 'actor_user_id', 'action', 'metadata'],
    priority: 'P1',
  },
];

export type NotificationBlueprint = {
  key: string;
  title: string;
  description: string;
  recipients: string[];
  priority: DecisionPriority;
  dedupeKey: string;
};

export const NOTIFICATION_EVENT_BLUEPRINTS: NotificationBlueprint[] = [
  {
    key: 'REQUISITION_SUBMITTED',
    title: 'Requisition Submitted',
    description: 'Notify office reviewers when a requisition is created.',
    recipients: ['office_head', 'caretaker'],
    priority: 'P0',
    dedupeKey: 'type+entity_type+entity_id+recipient+day',
  },
  {
    key: 'REQUISITION_VERIFIED_OR_REJECTED',
    title: 'Requisition Verification Outcome',
    description: 'Notify requester and target on verification decision.',
    recipients: ['requester', 'target'],
    priority: 'P0',
    dedupeKey: 'type+entity_type+entity_id+recipient+day',
  },
  {
    key: 'REQUISITION_FULFILLED_PENDING_SIGNATURE',
    title: 'Requisition Fulfilled Pending Signature',
    description: 'Notify requester, target, and office head for signature step.',
    recipients: ['requester', 'target', 'office_head'],
    priority: 'P0',
    dedupeKey: 'type+entity_type+entity_id+recipient+day',
  },
  {
    key: 'ASSIGNMENT_DRAFT_CREATED',
    title: 'Assignment Draft Created',
    description: 'Notify assignee and caretaker that assignment draft exists.',
    recipients: ['assignee', 'caretaker'],
    priority: 'P0',
    dedupeKey: 'type+entity_type+entity_id+recipient+day',
  },
  {
    key: 'ASSIGNMENT_HANDOVER_SIGNED',
    title: 'Assignment Signed Handover Uploaded',
    description: 'Notify assignee and office head when handover signed.',
    recipients: ['assignee', 'office_head'],
    priority: 'P0',
    dedupeKey: 'type+entity_type+entity_id+recipient+day',
  },
  {
    key: 'RETURN_REQUESTED',
    title: 'Return Requested',
    description: 'Notify caretaker and office head for return process.',
    recipients: ['caretaker', 'office_head'],
    priority: 'P0',
    dedupeKey: 'type+entity_type+entity_id+recipient+day',
  },
  {
    key: 'RETURN_CLOSED',
    title: 'Return Closed',
    description: 'Notify requester and assignee that return is closed.',
    recipients: ['requester', 'assignee'],
    priority: 'P0',
    dedupeKey: 'type+entity_type+entity_id+recipient+day',
  },
  {
    key: 'CONSUMABLE_LOT_RECEIVED',
    title: 'Consumable Lot Received',
    description: 'Notify stock managers when lot received.',
    recipients: ['caretaker', 'location_head'],
    priority: 'P0',
    dedupeKey: 'type+entity_type+entity_id+recipient+day',
  },
  {
    key: 'CONSUMABLE_TRANSFER_COMPLETED',
    title: 'Consumable Transfer Completed',
    description: 'Notify source and destination location managers.',
    recipients: ['source_head', 'destination_head'],
    priority: 'P0',
    dedupeKey: 'type+entity_type+entity_id+recipient+day',
  },
  {
    key: 'LOW_STOCK_THRESHOLD',
    title: 'Low Stock Threshold Triggered',
    description: 'Notify stock owners when item drops below threshold.',
    recipients: ['caretaker', 'office_head'],
    priority: 'P0',
    dedupeKey: 'type+entity_type+entity_id+recipient+day',
  },
  {
    key: 'EXPIRY_WARNING',
    title: 'Expiry Warning',
    description: 'Notify location managers for expiry windows (30/15/7 days).',
    recipients: ['caretaker', 'location_head'],
    priority: 'P0',
    dedupeKey: 'type+entity_type+entity_id+recipient+day',
  },
  {
    key: 'PURCHASE_ORDER_STATUS_CHANGED',
    title: 'Purchase Order Status Changed',
    description: 'Notify relevant owner when PO status transitions.',
    recipients: ['requester', 'office_head'],
    priority: 'P1',
    dedupeKey: 'type+entity_type+entity_id+recipient+day',
  },
  {
    key: 'COMPLIANCE_ALERT',
    title: 'Compliance Alert',
    description: 'Notify relevant heads for compliance failures.',
    recipients: ['office_head', 'directorate_head', 'org_admin'],
    priority: 'P1',
    dedupeKey: 'type+entity_type+entity_id+recipient+day',
  },
];

