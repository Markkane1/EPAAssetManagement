export type NotificationToggleKey =
  | 'low_stock_alerts'
  | 'maintenance_reminders'
  | 'assignment_notifications'
  | 'warranty_expiry_alerts';

export type NotificationAreaStatus = 'Live' | 'Planned';

export type NotificationAreaDefinition = {
  id: string;
  area: string;
  events: string;
  toggle: NotificationToggleKey;
  status: NotificationAreaStatus;
  notes: string;
};

export const NOTIFICATION_TOGGLE_LABELS: Record<NotificationToggleKey, string> = {
  low_stock_alerts: 'Low Stock Alerts',
  maintenance_reminders: 'Maintenance Reminders',
  assignment_notifications: 'Assignment Notifications',
  warranty_expiry_alerts: 'Warranty Expiry Alerts',
};

export const NOTIFICATION_AREA_DEFINITIONS: NotificationAreaDefinition[] = [
  {
    id: 'assignment-lifecycle',
    area: 'Assignment lifecycle',
    events:
      'Draft created, handover slip ready, issued, return requested, return slip ready, returned, cancelled',
    toggle: 'assignment_notifications',
    status: 'Live',
    notes: 'Already emitted and now controlled by Settings.',
  },
  {
    id: 'requisition-workflow',
    area: 'Requisition workflow',
    events:
      'Submitted, approved/rejected, line mapped, adjusted, fulfilled/status changed, signed issuance uploaded',
    toggle: 'assignment_notifications',
    status: 'Live',
    notes: 'Uses assignment notifications path for requisition lifecycle events.',
  },
  {
    id: 'transfer-lifecycle',
    area: 'Transfer lifecycle',
    events: 'Request created, approved/rejected, dispatch and receipt milestones, cancelled',
    toggle: 'assignment_notifications',
    status: 'Live',
    notes: 'Triggered on create, approve/reject, dispatch, and receipt transitions.',
  },
  {
    id: 'return-request-lifecycle',
    area: 'Return request lifecycle',
    events: 'Submitted, received (pending signature), closed after signed return upload',
    toggle: 'assignment_notifications',
    status: 'Live',
    notes: 'Emitted to office managers, org admin, and linked employee user.',
  },
  {
    id: 'maintenance-lifecycle',
    area: 'Maintenance lifecycle',
    events: 'Scheduled, due soon, overdue, completed, updated, removed',
    toggle: 'maintenance_reminders',
    status: 'Live',
    notes: 'Triggered on scheduling, due/overdue reminders, and completion.',
  },
  {
    id: 'approval-workflow',
    area: 'Approval workflow',
    events: 'Approval requested and approval decision recorded',
    toggle: 'assignment_notifications',
    status: 'Live',
    notes: 'Record-level approval notifications are emitted from approval services.',
  },
  {
    id: 'consumables-workflow',
    area: 'Consumables workflow',
    events: 'Issue, receive, transfer, consume, adjust, dispose, return, opening balance',
    toggle: 'assignment_notifications',
    status: 'Live',
    notes: 'Emitted for office-scoped consumable transactions and lab-capable flows.',
  },
  {
    id: 'purchase-order-workflow',
    area: 'Purchase order workflow',
    events: 'Purchase order created, status changed, removed',
    toggle: 'assignment_notifications',
    status: 'Live',
    notes: 'Emitted when office context can be resolved for recipients.',
  },
  {
    id: 'employee-transfer',
    area: 'Employee transfer',
    events: 'Employee transferred between offices',
    toggle: 'assignment_notifications',
    status: 'Live',
    notes: 'Emitted to source/destination office managers, org admin, and employee user.',
  },
  {
    id: 'low-stock-threshold',
    area: 'Low stock threshold',
    events: 'Asset/consumable stock reaches configured threshold',
    toggle: 'low_stock_alerts',
    status: 'Live',
    notes: 'Emitted from threshold checks and deduped daily.',
  },
  {
    id: 'warranty-expiry',
    area: 'Warranty expiry',
    events: 'Warranty expiring in pre-alert window and on expiry',
    toggle: 'warranty_expiry_alerts',
    status: 'Live',
    notes: 'Emitted on item create/update and periodic threshold checks.',
  },
  {
    id: 'document-signoff',
    area: 'Document/signoff',
    events: 'Signed handover/return/issuance upload milestones',
    toggle: 'assignment_notifications',
    status: 'Live',
    notes: 'Upload milestones are emitted; missing-document compliance alerts remain planned.',
  },
  {
    id: 'approval-escalations',
    area: 'Approvals/escalations',
    events: 'Pending approvals nearing SLA or escalated',
    toggle: 'assignment_notifications',
    status: 'Planned',
    notes: 'Useful for office heads and caretakers.',
  },
];
