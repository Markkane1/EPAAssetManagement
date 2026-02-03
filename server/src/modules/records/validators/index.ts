import { z } from 'zod';

export const recordCreateSchema = z.object({
  recordType: z.enum(['ISSUE', 'RETURN', 'TRANSFER', 'MAINTENANCE', 'DISPOSAL', 'INCIDENT']),
  officeId: z.string().optional(),
  status: z.enum(['Draft', 'PendingApproval', 'Approved', 'Completed', 'Rejected', 'Cancelled', 'Archived']).optional(),
  assetItemId: z.string().optional(),
  employeeId: z.string().optional(),
  assignmentId: z.string().optional(),
  transferId: z.string().optional(),
  maintenanceRecordId: z.string().optional(),
  notes: z.string().optional(),
});

export const recordStatusSchema = z.object({
  status: z.enum(['Draft', 'PendingApproval', 'Approved', 'Completed', 'Rejected', 'Cancelled', 'Archived']),
  notes: z.string().optional(),
});

export const recordListQuerySchema = z.object({
  recordType: z.string().optional(),
  status: z.string().optional(),
  officeId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  assetItemId: z.string().optional(),
  employeeId: z.string().optional(),
  assignmentId: z.string().optional(),
  transferId: z.string().optional(),
  maintenanceRecordId: z.string().optional(),
  referenceNo: z.string().optional(),
});

export const registerQuerySchema = z.object({
  office: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const approvalRequestSchema = z.object({
  approverUserId: z.string().optional(),
  approverRole: z.string().optional(),
  notes: z.string().optional(),
}).refine((data) => Boolean(data.approverUserId || data.approverRole), {
  message: 'Approver user or role is required',
  path: ['approverRole'],
});

export const approvalDecisionSchema = z.object({
  decision: z.enum(['Approved', 'Rejected', 'Cancelled']),
  decisionNotes: z.string().optional(),
});

export const documentCreateSchema = z.object({
  title: z.string().min(1),
  docType: z.enum([
    'IssueSlip',
    'ReturnSlip',
    'TransferChallan',
    'MaintenanceJobCard',
    'Warranty',
    'Invoice',
    'DisposalApproval',
    'IncidentReport',
    'Other',
  ]),
  status: z.enum(['Draft', 'Final', 'Archived']).optional(),
  officeId: z.string().optional(),
});

export const documentListQuerySchema = z.object({
  officeId: z.string().optional(),
  docType: z.string().optional(),
  status: z.string().optional(),
});

export const documentLinkSchema = z.object({
  documentId: z.string(),
  entityType: z.enum(['Record', 'AssetItem', 'Assignment', 'Transfer', 'MaintenanceRecord']),
  entityId: z.string(),
  requiredForStatus: z.enum(['PendingApproval', 'Approved', 'Completed']).optional(),
});
