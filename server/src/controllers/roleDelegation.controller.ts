import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import type { AuthRequest } from '../middleware/auth';
import { RoleDelegationModel } from '../models/roleDelegation.model';
import { UserModel } from '../models/user.model';
import { OfficeModel } from '../models/office.model';
import { ActivityLogModel } from '../models/activityLog.model';
import { createHttpError } from '../utils/httpError';
import { hasRoleCapability, normalizeRole, normalizeRoles } from '../utils/roles';
import { createNotification } from '../services/notification.service';

function parseDate(value: unknown, field: string) {
  const text = String(value || '').trim();
  if (!text) throw createHttpError(400, `${field} is required`);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    throw createHttpError(400, `${field} is invalid`);
  }
  return parsed;
}

function assertObjectId(value: unknown, field: string) {
  const id = String(value || '').trim();
  if (!Types.ObjectId.isValid(id)) {
    throw createHttpError(400, `${field} is invalid`);
  }
  return id;
}

function ensureCanManageDelegations(req: AuthRequest) {
  const user = req.user;
  if (!user) throw createHttpError(401, 'Unauthorized');
  const hasAccess =
    user.isOrgAdmin
    || hasRoleCapability(user.roles || [user.role], ['office_head', 'caretaker']);
  if (!hasAccess) {
    throw createHttpError(403, 'Forbidden');
  }
  return user;
}

function canDelegateRole(delegatorRoles: string[], delegatedRole: string) {
  const normalized = normalizeRole(delegatedRole);
  if (normalized === 'org_admin') return false;
  if (normalized === 'employee') return true;
  if (normalized === 'inventory_controller' || normalized === 'storekeeper') {
    return hasRoleCapability(delegatorRoles, ['caretaker']);
  }
  if (normalized === 'procurement_officer') {
    return hasRoleCapability(delegatorRoles, ['office_head', 'procurement_officer']);
  }
  if (normalized === 'compliance_auditor') {
    return hasRoleCapability(delegatorRoles, ['office_head', 'caretaker']);
  }
  return hasRoleCapability(delegatorRoles, [normalized]);
}

async function writeDelegationAudit(input: {
  req: AuthRequest;
  activityType: string;
  description: string;
  metadata: Record<string, unknown>;
}) {
  const userId = input.req.user?.userId;
  if (!userId) return;
  await ActivityLogModel.create({
    user_id: userId,
    activity_type: input.activityType,
    description: input.description,
    metadata: input.metadata,
    ip_address: input.req.ip,
    user_agent: input.req.headers['user-agent'] || null,
  });
}

export const roleDelegationController = {
  list: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = ensureCanManageDelegations(req);
      const officeId = String(req.query.officeId || '').trim();
      const includeInactive = String(req.query.includeInactive || '').trim().toLowerCase();
      const statusFilter =
        includeInactive === '1' || includeInactive === 'true'
          ? {}
          : { status: 'ACTIVE' };
      const now = new Date();

      const baseFilter: Record<string, unknown> = {
        ...statusFilter,
      };
      if (user.isOrgAdmin) {
        if (officeId) {
          if (!Types.ObjectId.isValid(officeId)) {
            throw createHttpError(400, 'officeId is invalid');
          }
          baseFilter.office_id = officeId;
        }
      } else {
        if (!user.locationId) throw createHttpError(403, 'User is not assigned to an office');
        baseFilter.office_id = user.locationId;
      }

      const rows = await RoleDelegationModel.find(baseFilter)
        .sort({ starts_at: -1, created_at: -1 })
        .lean()
        .exec();

      const ids = new Set<string>();
      rows.forEach((row: any) => {
        ids.add(String(row.delegator_user_id || ''));
        ids.add(String(row.delegate_user_id || ''));
        if (row.revoked_by_user_id) ids.add(String(row.revoked_by_user_id));
      });
      const users = await UserModel.find({ _id: { $in: Array.from(ids).filter((id) => Types.ObjectId.isValid(id)) } }, { email: 1 })
        .lean()
        .exec();
      const userMap = new Map(users.map((entry: any) => [String(entry._id), String(entry.email || '')]));

      return res.json(
        rows.map((row: any) => ({
          ...row,
          is_currently_active:
            row.status === 'ACTIVE'
            && new Date(row.starts_at).getTime() <= now.getTime()
            && new Date(row.ends_at).getTime() >= now.getTime(),
          delegator_email: userMap.get(String(row.delegator_user_id || '')) || null,
          delegate_email: userMap.get(String(row.delegate_user_id || '')) || null,
          revoked_by_email: row.revoked_by_user_id
            ? userMap.get(String(row.revoked_by_user_id || '')) || null
            : null,
        }))
      );
    } catch (error) {
      next(error);
    }
  },
  create: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = ensureCanManageDelegations(req);
      if (!user.locationId && !user.isOrgAdmin) {
        throw createHttpError(403, 'User is not assigned to an office');
      }

      const delegateUserId = assertObjectId(req.body?.delegateUserId, 'delegateUserId');
      const startsAt = parseDate(req.body?.startsAt, 'startsAt');
      const endsAt = parseDate(req.body?.endsAt, 'endsAt');
      if (endsAt.getTime() <= startsAt.getTime()) {
        throw createHttpError(400, 'endsAt must be later than startsAt');
      }

      const delegatedRoles = normalizeRoles(req.body?.delegatedRoles, null, { allowEmpty: true });
      if (delegatedRoles.length === 0) {
        throw createHttpError(400, 'delegatedRoles is required');
      }
      if (delegatedRoles.includes('org_admin')) {
        throw createHttpError(400, 'org_admin role cannot be delegated');
      }

      const delegatorUser: any = await UserModel.findById(user.userId).lean();
      if (!delegatorUser) throw createHttpError(401, 'Unauthorized');
      const delegateUser: any = await UserModel.findById(delegateUserId).lean();
      if (!delegateUser || delegateUser.is_active === false) {
        throw createHttpError(404, 'Delegate user not found');
      }

      const officeId = user.isOrgAdmin
        ? String(req.body?.officeId || '').trim()
        : String(user.locationId || '').trim();
      if (!Types.ObjectId.isValid(officeId)) {
        throw createHttpError(400, 'officeId is invalid');
      }
      const office = (await OfficeModel.findOne(
        { _id: officeId, is_active: { $ne: false } },
        { _id: 1 }
      ).lean()) as { _id?: unknown } | null;
      if (!office?._id) {
        throw createHttpError(400, 'officeId was not found or is inactive');
      }

      const delegateLocationId = String(delegateUser.location_id || '').trim();
      if (delegateLocationId !== officeId) {
        throw createHttpError(400, 'Delegate user must belong to the selected office');
      }

      const delegatorRoles = user.roles || [];
      const forbiddenRole = delegatedRoles.find((role) => !canDelegateRole(delegatorRoles, role));
      if (forbiddenRole) {
        throw createHttpError(403, `You cannot delegate role ${forbiddenRole}`);
      }

      const overlap = await RoleDelegationModel.exists({
        delegator_user_id: user.userId,
        delegate_user_id: delegateUserId,
        office_id: officeId,
        status: 'ACTIVE',
        starts_at: { $lte: endsAt },
        ends_at: { $gte: startsAt },
      });
      if (overlap) {
        throw createHttpError(409, 'An overlapping active delegation already exists');
      }

      const delegation = await RoleDelegationModel.create({
        delegator_user_id: user.userId,
        delegate_user_id: delegateUserId,
        office_id: officeId,
        delegated_roles: delegatedRoles,
        starts_at: startsAt,
        ends_at: endsAt,
        reason: String(req.body?.reason || '').trim() || null,
        status: 'ACTIVE',
      });
      await createNotification({
        recipientUserId: delegateUserId,
        officeId,
        type: 'ROLE_DELEGATED',
        title: 'Delegated Authority Assigned',
        message: `You received delegated role(s): ${delegatedRoles.join(', ')}`,
        entityType: 'RoleDelegation',
        entityId: delegation.id,
        dedupeWindowHours: 1,
      });

      await writeDelegationAudit({
        req,
        activityType: 'role_delegated',
        description: `Delegated ${delegatedRoles.join(', ')} role(s) to ${delegateUserId}`,
        metadata: {
          delegationId: delegation.id,
          delegateUserId,
          officeId,
          delegatedRoles,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
        },
      });

      return res.status(201).json(delegation);
    } catch (error) {
      next(error);
    }
  },
  revoke: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = ensureCanManageDelegations(req);
      const delegationId = assertObjectId(req.params?.id, 'id');
      const delegation = await RoleDelegationModel.findById(delegationId);
      if (!delegation) throw createHttpError(404, 'Delegation not found');
      if (delegation.status !== 'ACTIVE') {
        throw createHttpError(409, 'Delegation is no longer active');
      }

      const delegationOfficeId = String(delegation.office_id || '');
      const canRevoke =
        user.isOrgAdmin
        || String(delegation.delegator_user_id || '') === user.userId
        || (user.locationId && user.locationId === delegationOfficeId && hasRoleCapability(user.roles || [], ['office_head', 'caretaker']));
      if (!canRevoke) {
        throw createHttpError(403, 'Forbidden');
      }

      delegation.status = 'REVOKED';
      delegation.revoked_at = new Date();
      delegation.revoked_by_user_id = user.userId;
      await delegation.save();
      await createNotification({
        recipientUserId: String(delegation.delegate_user_id || ''),
        officeId: delegationOfficeId,
        type: 'ROLE_DELEGATION_REVOKED',
        title: 'Delegated Authority Revoked',
        message: 'A delegated authority assignment has been revoked.',
        entityType: 'RoleDelegation',
        entityId: delegation.id,
        dedupeWindowHours: 1,
      });

      await writeDelegationAudit({
        req,
        activityType: 'role_delegation_revoked',
        description: `Revoked delegation ${delegation.id}`,
        metadata: {
          delegationId: delegation.id,
          delegateUserId: String(delegation.delegate_user_id || ''),
          officeId: delegationOfficeId,
          delegatedRoles: Array.isArray(delegation.delegated_roles) ? delegation.delegated_roles : [],
        },
      });

      return res.json(delegation);
    } catch (error) {
      next(error);
    }
  },
};
