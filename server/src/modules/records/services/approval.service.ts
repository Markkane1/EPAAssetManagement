import { ApprovalRequestModel } from '../../../models/approvalRequest.model';
import { RecordModel } from '../../../models/record.model';
import { createHttpError } from '../../../utils/httpError';
import { RequestContext } from '../../../utils/scope';
import { logAudit } from './audit.service';

export interface ApprovalRequestInput {
  approverUserId?: string;
  approverRole?: string;
  notes?: string;
}

export async function requestApproval(ctx: RequestContext, recordId: string, input: ApprovalRequestInput) {
  const record = await RecordModel.findById(recordId);
  if (!record) throw createHttpError(404, 'Record not found');
  if (!ctx.isHeadoffice && record.office_id.toString() !== ctx.locationId) {
    throw createHttpError(403, 'Access restricted to assigned office');
  }

  const approval = await ApprovalRequestModel.create({
    record_id: recordId,
    requested_by_user_id: ctx.userId,
    approver_user_id: input.approverUserId || null,
    approver_role: input.approverRole || null,
    status: 'Pending',
    requested_at: new Date(),
    decision_notes: input.notes || null,
  });

  if (record.status === 'Draft') {
    record.status = 'PendingApproval';
    await record.save();
  }

  await logAudit({
    ctx,
    action: 'REQUEST_APPROVAL',
    entityType: 'Record',
    entityId: record.id,
    officeId: record.office_id.toString(),
    diff: { approvalId: approval.id },
  });

  return approval;
}

export interface ApprovalDecisionInput {
  decision: 'Approved' | 'Rejected' | 'Cancelled';
  decisionNotes?: string;
}

export async function decideApproval(ctx: RequestContext, approvalId: string, input: ApprovalDecisionInput) {
  const approval = await ApprovalRequestModel.findById(approvalId);
  if (!approval) throw createHttpError(404, 'Approval request not found');

  const record = await RecordModel.findById(approval.record_id);
  if (!record) throw createHttpError(404, 'Record not found');

  if (!ctx.isHeadoffice && record.office_id.toString() !== ctx.locationId) {
    throw createHttpError(403, 'Access restricted to assigned office');
  }

  if (approval.approver_user_id && approval.approver_user_id.toString() !== ctx.userId && !ctx.isHeadoffice) {
    throw createHttpError(403, 'Not authorized to decide this approval');
  }

  if (!approval.approver_user_id && approval.approver_role && approval.approver_role !== ctx.role && !ctx.isHeadoffice) {
    throw createHttpError(403, 'Not authorized to decide this approval');
  }

  approval.status = input.decision;
  approval.decided_at = new Date();
  approval.decision_notes = input.decisionNotes || null;
  await approval.save();

  if (input.decision === 'Approved' && record.status === 'PendingApproval') {
    record.status = 'Approved';
    await record.save();
  }

  if (input.decision === 'Rejected' && record.status === 'PendingApproval') {
    record.status = 'Rejected';
    await record.save();
  }

  await logAudit({
    ctx,
    action: input.decision === 'Approved' ? 'APPROVE' : 'REJECT',
    entityType: 'Record',
    entityId: record.id,
    officeId: record.office_id.toString(),
    diff: { approvalId: approval.id, decision: input.decision },
  });

  return approval;
}
