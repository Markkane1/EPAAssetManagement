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
    events: 'Draft created, handover slip ready, issued, return requested, return slip ready, returned',
    toggle: 'assignment_notifications',
    status: 'Live',
    notes: 'Already emitted and now controlled by Settings.',
  },
  {
    id: 'requisition-to-assignment',
    area: 'Requisition fulfillment',
    events: 'Assignment drafts created from requisition fulfillment',
    toggle: 'assignment_notifications',
    status: 'Live',
    notes: 'Uses assignment notifications path.',
  },
  {
    id: 'transfer-lifecycle',
    area: 'Transfer lifecycle',
    events: 'Request created, approved/rejected, dispatch and receipt milestones',
    toggle: 'assignment_notifications',
    status: 'Planned',
    notes: 'Type support is prepared; event emitters still need to be added in transfer workflows.',
  },
  {
    id: 'maintenance-lifecycle',
    area: 'Maintenance lifecycle',
    events: 'Scheduled, due soon, overdue, completed',
    toggle: 'maintenance_reminders',
    status: 'Planned',
    notes: 'Should notify office/vendor stakeholders based on office scope.',
  },
  {
    id: 'low-stock-threshold',
    area: 'Low stock threshold',
    events: 'Asset/consumable stock reaches configured threshold',
    toggle: 'low_stock_alerts',
    status: 'Planned',
    notes: 'Best emitted from inventory services and dashboard jobs.',
  },
  {
    id: 'warranty-expiry',
    area: 'Warranty expiry',
    events: 'Warranty expiring in pre-alert window and on expiry',
    toggle: 'warranty_expiry_alerts',
    status: 'Planned',
    notes: 'Should run as scheduled reminder job.',
  },
  {
    id: 'document-signoff',
    area: 'Document/signoff',
    events: 'Signed handover/return/transfer document missing or uploaded',
    toggle: 'assignment_notifications',
    status: 'Planned',
    notes: 'Useful for compliance workflow checkpoints.',
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
