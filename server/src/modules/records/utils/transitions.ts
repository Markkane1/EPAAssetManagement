export type RecordStatus =
  | 'Draft'
  | 'PendingApproval'
  | 'Approved'
  | 'Completed'
  | 'Rejected'
  | 'Cancelled'
  | 'Archived';

export const ALLOWED_TRANSITIONS: Record<RecordStatus, RecordStatus[]> = {
  Draft: ['PendingApproval', 'Approved', 'Completed', 'Cancelled'],
  PendingApproval: ['Approved', 'Rejected', 'Cancelled'],
  Approved: ['Completed', 'Cancelled'],
  Completed: ['Archived'],
  Rejected: ['Cancelled'],
  Cancelled: ['Archived'],
  Archived: [],
};

export const REQUIRED_DOCUMENTS: Record<
  string,
  Partial<Record<RecordStatus, string[][]>>
> = {
  TRANSFER: {
    Completed: [['TransferChallan']],
  },
  DISPOSAL: {
    Approved: [['DisposalApproval']],
    Completed: [['DisposalApproval']],
  },
  MAINTENANCE: {
    Completed: [['MaintenanceJobCard', 'Invoice']],
  },
};

export const APPROVAL_REQUIRED: Record<string, RecordStatus[]> = {
  TRANSFER: ['Approved', 'Completed'],
  DISPOSAL: ['Approved', 'Completed'],
};
