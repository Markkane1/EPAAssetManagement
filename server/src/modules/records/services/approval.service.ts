import { ApprovalRequestModel } from '../../../models/approvalRequest.model';
import { RecordModel } from '../../../models/record.model';
import { UserModel } from '../../../models/user.model';
import { createBulkNotifications, resolveNotificationRecipientsByOffice } from '../../../services/notification.service';
import { createHttpError } from '../../../utils/httpError';
import { RequestContext } from '../../../utils/scope';
import { buildUserRoleMatchFilter, hasRoleCapability, normalizeRoles } from '../../../utils/roles';
import { logAudit } from './audit.service';

export interface ApprovalRequestInput {
  approverUserId?: string;
  approverRole?: string;
  notes?: string;
}

function expandApproverRoles(role: string) {
  const [normalized] = normalizeRoles([role], null, { allowEmpty: true });
  if (!normalized) return [] as string[];
  if (normalized === 'office_head' || normalized === 'head_office_admin') {
    return ['office_head', 'head_office_admin'];
  }
  return [normalized];
}

function uniqueObjectIdStrings(list: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      list
        .map((entry) => String(entry || '').trim())
        .filter((entry) => /^[0-9a-fA-F]{24}$/.test(entry))
    )
  );
}

async function dispatchApprovalNotifications(input: {
  officeId: string;
  recordId: string;
  type: 'APPROVAL_REQUESTED' | 'APPROVAL_DECIDED';
  title: string;
  message: string;
  includeRoles?: string[];
  includeUserIds?: Array<string | null | undefined>;
  excludeUserIds?: Array<string | null | undefined>;
}) {
  const recipients = await resolveNotificationRecipientsByOffice({
    officeIds: [input.officeId],
    includeOrgAdmins: true,
    includeRoles: input.includeRoles || ['office_head', 'caretaker'],
    includeUserIds: uniqueObjectIdStrings(input.includeUserIds || []),
    excludeUserIds: uniqueObjectIdStrings(input.excludeUserIds || []),
  });
  if (recipients.length === 0) return;

  await createBulkNotifications(
    recipients.map((recipientUserId) => ({
      recipientUserId,
      officeId: input.officeId,
      type: input.type,
      title: input.title,
      message: input.message,
      entityType: 'Record',
      entityId: input.recordId,
      dedupeWindowHours: 12,
    }))
  );
}

export async function requestApproval(ctx: RequestContext, recordId: string, input: ApprovalRequestInput) {
  const record = await RecordModel.findById(recordId);
  if (!record) throw createHttpError(404, 'Record not found');
  if (!ctx.isOrgAdmin && record.office_id.toString() !== ctx.locationId) {
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

  let approverUserIds: string[] = [];
  if (input.approverUserId && /^[0-9a-fA-F]{24}$/.test(input.approverUserId)) {
    approverUserIds = [input.approverUserId];
  } else if (input.approverRole) {
    const roleUsers = await UserModel.find(
      {
        ...buildUserRoleMatchFilter(expandApproverRoles(String(input.approverRole))),
        location_id: record.office_id,
        is_active: true,
      },
      { _id: 1 }
    )
      .lean()
      .exec();
    approverUserIds = roleUsers.map((user) => String(user._id));
  }
  await dispatchApprovalNotifications({
    officeId: record.office_id.toString(),
    recordId: record.id,
    type: 'APPROVAL_REQUESTED',
    title: 'Approval Requested',
    message: `Approval has been requested for record ${record.reference_no}.`,
    includeUserIds: [ctx.userId, ...approverUserIds],
    excludeUserIds: [ctx.userId],
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

  if (!ctx.isOrgAdmin && record.office_id.toString() !== ctx.locationId) {
    throw createHttpError(403, 'Access restricted to assigned office');
  }

  if (approval.approver_user_id && approval.approver_user_id.toString() !== ctx.userId && !ctx.isOrgAdmin) {
    throw createHttpError(403, 'Not authorized to decide this approval');
  }

  if (
    !approval.approver_user_id
    && approval.approver_role
    && !hasRoleCapability(ctx.roles || [ctx.role], [String(approval.approver_role)])
    && !ctx.isOrgAdmin
  ) {
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

  await dispatchApprovalNotifications({
    officeId: record.office_id.toString(),
    recordId: record.id,
    type: 'APPROVAL_DECIDED',
    title: 'Approval Decision',
    message: `Approval for record ${record.reference_no} was marked as ${input.decision}.`,
    includeUserIds: [String(approval.requested_by_user_id || ''), ctx.userId],
    excludeUserIds: [ctx.userId],
  });

  return approval;
}

