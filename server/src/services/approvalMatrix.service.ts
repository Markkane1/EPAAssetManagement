import crypto from 'crypto';
import { Types } from 'mongoose';
import { ApprovalMatrixRequestModel } from '../models/approvalMatrixRequest.model';
import { UserModel } from '../models/user.model';
import { createBulkNotifications } from './notification.service';
import { getWorkflowConfigSnapshot, type ApprovalMatrixRule } from './workflowConfig.service';
import { createHttpError } from '../utils/httpError';
import { buildUserRoleMatchFilter, hasRoleCapability } from '../utils/roles';
import type { RequestContext } from '../utils/scope';

type ApprovalGateInput = {
  transactionType: string;
  makerUserId: string;
  makerRoles: string[];
  makerOfficeId?: string | null;
  amount?: number;
  riskTags?: string[];
  entityType?: string | null;
  entityId?: string | null;
  payloadDigestInput: unknown;
  approvalWorkflowId?: string | null;
};

type ApprovalGateResult =
  | { status: 'not_required'; rule: null; request: null; workflowIdToExecute: null }
  | { status: 'pending'; rule: ApprovalMatrixRule; request: any; workflowIdToExecute: null }
  | { status: 'approved'; rule: ApprovalMatrixRule; request: any; workflowIdToExecute: string };

function normalizeRoles(input: unknown) {
  if (!Array.isArray(input)) return [] as string[];
  return Array.from(
    new Set(
      input
        .map((entry) => String(entry || '').trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function normalizeRiskTags(input: unknown) {
  if (!Array.isArray(input)) return [] as string[];
  return Array.from(
    new Set(
      input
        .map((entry) => String(entry || '').trim().toUpperCase())
        .filter(Boolean)
    )
  );
}

function normalizeAmount(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function matchesRiskTags(rule: ApprovalMatrixRule, riskTags: string[]) {
  if (!Array.isArray(rule.risk_tags) || rule.risk_tags.length === 0) return true;
  if (riskTags.length === 0) return false;
  return rule.risk_tags.every((tag) => riskTags.includes(tag));
}

function pickMatchingRule(rules: ApprovalMatrixRule[], input: { transactionType: string; amount: number; riskTags: string[] }) {
  const candidates = rules.filter((rule) => {
    if (!rule.enabled) return false;
    if (String(rule.transaction_type).toUpperCase() !== input.transactionType) return false;
    if (input.amount < Number(rule.min_amount || 0)) return false;
    if (!matchesRiskTags(rule, input.riskTags)) return false;
    return true;
  });

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const approvalsDelta = Number(b.required_approvals || 0) - Number(a.required_approvals || 0);
    if (approvalsDelta !== 0) return approvalsDelta;
    const minAmountDelta = Number(b.min_amount || 0) - Number(a.min_amount || 0);
    if (minAmountDelta !== 0) return minAmountDelta;
    return Number(b.risk_tags?.length || 0) - Number(a.risk_tags?.length || 0);
  });
  return candidates[0];
}

function ensureObjectId(value: unknown) {
  const normalized = String(value || '').trim();
  return Types.ObjectId.isValid(normalized) ? normalized : null;
}

function normalizeEntityType(entityType: unknown) {
  const normalized = String(entityType || '').trim();
  if (!normalized) return null;
  return normalized;
}

function buildPayloadDigest(payloadDigestInput: unknown) {
  const serialized = JSON.stringify(payloadDigestInput ?? null);
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

async function resolveApproverUserIds(rule: ApprovalMatrixRule, officeId: string | null, makerUserId: string) {
  const roleList = normalizeRoles(rule.approver_roles);
  if (roleList.length === 0) return [] as string[];

  const query: Record<string, unknown> = {
    is_active: true,
    ...buildUserRoleMatchFilter(roleList),
  };
  if (rule.scope === 'same_office' && officeId) {
    query.location_id = officeId;
  }

  const users = await UserModel.find(query, { _id: 1 }).lean().exec();
  const userIds = users.map((user) => String(user._id));
  if (!rule.disallow_maker) return userIds;
  return userIds.filter((userId) => userId !== makerUserId);
}

async function notifyApprovalRequested(input: { request: any; approverUserIds: string[] }) {
  const officeId = ensureObjectId(input.request.office_id);
  const entityId = ensureObjectId(input.request.entity_id);
  const entityType = normalizeEntityType(input.request.entity_type);
  if (!officeId || !entityId || !entityType || input.approverUserIds.length === 0) {
    return;
  }

  await createBulkNotifications(
    input.approverUserIds.map((recipientUserId) => ({
      recipientUserId,
      officeId,
      type: 'APPROVAL_REQUESTED',
      title: 'Approval Required',
      message: `Approval required for ${String(input.request.transaction_type || 'transaction')} request.`,
      entityType,
      entityId,
      dedupeWindowHours: 8,
    }))
  );
}

async function notifyApprovalDecision(request: any) {
  const officeId = ensureObjectId(request.office_id);
  const entityId = ensureObjectId(request.entity_id);
  const entityType = normalizeEntityType(request.entity_type);
  const makerUserId = ensureObjectId(request.maker_user_id);
  if (!officeId || !entityId || !entityType || !makerUserId) return;

  const status = String(request.status || '');
  await createBulkNotifications([
    {
      recipientUserId: makerUserId,
      officeId,
      type: 'APPROVAL_DECIDED',
      title: 'Approval Decision',
      message: `Approval request is now ${status}.`,
      entityType,
      entityId,
      dedupeWindowHours: 4,
    },
  ]);
}

export async function enforceApprovalMatrix(input: ApprovalGateInput): Promise<ApprovalGateResult> {
  const config = await getWorkflowConfigSnapshot();
  const normalizedTransactionType = String(input.transactionType || '').trim().toUpperCase();
  const amount = normalizeAmount(input.amount);
  const riskTags = normalizeRiskTags(input.riskTags);
  const rule = pickMatchingRule(config.approvalMatrix.rules, {
    transactionType: normalizedTransactionType,
    amount,
    riskTags,
  });

  if (!rule) {
    return {
      status: 'not_required',
      rule: null,
      request: null,
      workflowIdToExecute: null,
    };
  }

  const payloadDigest = buildPayloadDigest(input.payloadDigestInput);
  const makerUserId = ensureObjectId(input.makerUserId);
  if (!makerUserId) {
    throw createHttpError(400, 'maker user id is invalid');
  }
  const makerOfficeId = ensureObjectId(input.makerOfficeId);
  const entityId = ensureObjectId(input.entityId);
  const entityType = normalizeEntityType(input.entityType);
  const explicitWorkflowId = ensureObjectId(input.approvalWorkflowId);

  if (explicitWorkflowId) {
    const existing = await ApprovalMatrixRequestModel.findById(explicitWorkflowId);
    if (!existing) {
      throw createHttpError(404, 'Approval workflow not found');
    }
    if (String(existing.transaction_type || '').toUpperCase() !== normalizedTransactionType) {
      throw createHttpError(409, 'Approval workflow does not match transaction type');
    }
    if (String(existing.maker_user_id || '') !== makerUserId) {
      throw createHttpError(403, 'Approval workflow does not belong to this requester');
    }
    if (String(existing.payload_digest || '') !== payloadDigest) {
      throw createHttpError(409, 'Approval workflow does not match current payload');
    }
    if (String(existing.status || '') === 'Executed') {
      throw createHttpError(409, 'Approval workflow was already consumed');
    }
    if (String(existing.status || '') !== 'Approved') {
      throw createHttpError(409, 'Approval workflow is not approved yet');
    }
    return {
      status: 'approved',
      rule,
      request: existing,
      workflowIdToExecute: existing.id,
    };
  }

  const existingApproved = await ApprovalMatrixRequestModel.findOne({
    transaction_type: normalizedTransactionType,
    maker_user_id: makerUserId,
    payload_digest: payloadDigest,
    status: 'Approved',
  })
    .sort({ requested_at: -1 })
    .exec();
  if (existingApproved) {
    return {
      status: 'approved',
      rule,
      request: existingApproved,
      workflowIdToExecute: existingApproved.id,
    };
  }

  const existingPending = await ApprovalMatrixRequestModel.findOne({
    transaction_type: normalizedTransactionType,
    maker_user_id: makerUserId,
    payload_digest: payloadDigest,
    status: 'Pending',
  })
    .sort({ requested_at: -1 })
    .exec();
  if (existingPending) {
    return {
      status: 'pending',
      rule,
      request: existingPending,
      workflowIdToExecute: null,
    };
  }

  const approverUserIds = await resolveApproverUserIds(rule, makerOfficeId, makerUserId);
  const created = await ApprovalMatrixRequestModel.create({
    transaction_type: normalizedTransactionType,
    entity_type: entityType,
    entity_id: entityId,
    office_id: makerOfficeId,
    maker_user_id: makerUserId,
    amount,
    risk_tags: riskTags,
    payload_digest: payloadDigest,
    status: 'Pending',
    requested_at: new Date(),
    required_approvals: Math.max(1, Number(rule.required_approvals || 1)),
    approvals: [],
    rule_snapshot: {
      id: rule.id,
      transaction_type: rule.transaction_type,
      min_amount: rule.min_amount,
      risk_tags: rule.risk_tags,
      required_approvals: rule.required_approvals,
      approver_roles: rule.approver_roles,
      scope: rule.scope,
      disallow_maker: rule.disallow_maker,
    },
  });

  await notifyApprovalRequested({
    request: created,
    approverUserIds,
  });

  return {
    status: 'pending',
    rule,
    request: created,
    workflowIdToExecute: null,
  };
}

function canDecideApproval(ctx: RequestContext, request: any) {
  if (ctx.isOrgAdmin) return true;
  const rule = request.rule_snapshot || {};
  const approverRoles = normalizeRoles(rule.approver_roles);
  if (approverRoles.length === 0) return false;
  if (!hasRoleCapability(ctx.roles || [ctx.role], approverRoles)) return false;

  if (String(rule.scope || 'same_office') === 'same_office') {
    const officeId = String(request.office_id || '').trim();
    if (!officeId) return false;
    if (!ctx.locationId || String(ctx.locationId) !== officeId) return false;
  }
  return true;
}

export async function decideApprovalMatrixRequest(
  ctx: RequestContext,
  requestId: string,
  input: { decision: 'Approved' | 'Rejected'; notes?: string }
) {
  const request = await ApprovalMatrixRequestModel.findById(requestId);
  if (!request) {
    throw createHttpError(404, 'Approval workflow not found');
  }
  if (String(request.status || '') !== 'Pending') {
    throw createHttpError(409, 'Approval workflow is not pending');
  }

  const makerUserId = String(request.maker_user_id || '');
  const disallowMaker = Boolean(request.rule_snapshot?.disallow_maker);
  if (disallowMaker && makerUserId && makerUserId === ctx.userId && !ctx.isOrgAdmin) {
    throw createHttpError(403, 'Maker cannot decide this approval');
  }
  if (!canDecideApproval(ctx, request)) {
    throw createHttpError(403, 'Not authorized to decide this approval');
  }
  const alreadyDecided = Array.isArray(request.approvals)
    && request.approvals.some((entry: any) => String(entry.approver_user_id || '') === ctx.userId);
  if (alreadyDecided) {
    throw createHttpError(409, 'You already decided this approval');
  }

  request.approvals = Array.isArray(request.approvals) ? request.approvals : [];
  request.approvals.push({
    approver_user_id: ctx.userId,
    decision: input.decision,
    decided_at: new Date(),
    notes: input.notes ? String(input.notes).trim() : null,
  });

  if (input.decision === 'Rejected') {
    request.status = 'Rejected';
    request.rejected_at = new Date();
  } else {
    const approvedCount = request.approvals.filter((entry: any) => String(entry.decision) === 'Approved').length;
    const required = Math.max(1, Number(request.required_approvals || 1));
    if (approvedCount >= required) {
      request.status = 'Approved';
      request.approved_at = new Date();
    }
  }

  await request.save();
  await notifyApprovalDecision(request);
  return request;
}

export async function markApprovalWorkflowExecuted(requestId: string) {
  const request = await ApprovalMatrixRequestModel.findById(requestId);
  if (!request) return null;
  if (String(request.status || '') === 'Executed') return request;
  if (String(request.status || '') !== 'Approved') {
    throw createHttpError(409, 'Only approved workflows can be executed');
  }
  request.status = 'Executed';
  request.executed_at = new Date();
  await request.save();
  return request;
}

export async function listPendingApprovalMatrixRequests(ctx: RequestContext) {
  const filter: Record<string, unknown> = { status: 'Pending' };
  if (!ctx.isOrgAdmin && ctx.locationId) {
    filter.$or = [
      { office_id: ctx.locationId },
      { office_id: null },
    ];
  } else if (!ctx.isOrgAdmin && !ctx.locationId) {
    filter.office_id = null;
  }

  const rows = await ApprovalMatrixRequestModel.find(filter)
    .sort({ requested_at: -1 })
    .limit(200)
    .lean()
    .exec();

  return rows.filter((row: any) => {
    const tempCtx: RequestContext = {
      userId: ctx.userId,
      role: ctx.role,
      roles: ctx.roles || [ctx.role],
      locationId: ctx.locationId,
      isOrgAdmin: ctx.isOrgAdmin,
    };
    if (!canDecideApproval(tempCtx, row)) return false;
    const alreadyDecided = Array.isArray(row.approvals)
      && row.approvals.some((entry: any) => String(entry.approver_user_id || '') === ctx.userId);
    return !alreadyDecided;
  });
}
