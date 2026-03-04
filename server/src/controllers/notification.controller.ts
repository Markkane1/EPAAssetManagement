import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import type { AuthRequest } from '../middleware/auth';
import { createHttpError } from '../utils/httpError';
import { NotificationModel } from '../models/notification.model';
import { ApprovalRequestModel } from '../models/approvalRequest.model';
import { getRequestContext } from '../utils/scope';
import { decideApproval } from '../modules/records/services/approval.service';

const ACTIONABLE_NOTIFICATION_TYPES = new Set(['APPROVAL_REQUESTED']);
const ACTION_KEYS = ['ACKNOWLEDGE', 'OPEN_RECORD', 'APPROVE', 'REJECT'] as const;
type NotificationAction = (typeof ACTION_KEYS)[number];

function parseAction(value: unknown) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!ACTION_KEYS.includes(normalized as NotificationAction)) {
    throw createHttpError(400, 'action is invalid');
  }
  return normalized as NotificationAction;
}

function buildOpenPath(entityType: string, entityId: string) {
  switch (entityType) {
    case 'Assignment':
      return '/assignments';
    case 'Requisition':
      return `/requisitions/${entityId}`;
    case 'Transfer':
      return `/transfers/${entityId}`;
    case 'MaintenanceRecord':
      return '/maintenance';
    case 'AssetItem':
      return '/asset-items';
    case 'ConsumableItem':
      return '/consumables';
    case 'ReturnRequest':
      return `/returns/${entityId}`;
    case 'Record':
      return '/compliance';
    case 'PurchaseOrder':
      return '/purchase-orders';
    case 'Employee':
      return `/employees/${entityId}`;
    case 'RoleDelegation':
      return '/profile';
    default:
      return '/settings/notifications';
  }
}

function isApprovalActionAlreadyTaken(notification: any) {
  const lastAction = String(notification?.last_action || '').trim().toUpperCase();
  return lastAction === 'APPROVE' || lastAction === 'REJECT';
}

function getAvailableActions(notification: any, pendingApprovalRecordIds?: Set<string>) {
  const actions: string[] = ['OPEN_RECORD'];
  if (!notification?.acknowledged_at) {
    actions.push('ACKNOWLEDGE');
  }

  if (!ACTIONABLE_NOTIFICATION_TYPES.has(String(notification?.type || ''))) {
    return actions;
  }
  if (isApprovalActionAlreadyTaken(notification)) {
    return actions;
  }
  const recordId = String(notification?.entity_id || '').trim();
  if (pendingApprovalRecordIds && !pendingApprovalRecordIds.has(recordId)) {
    return actions;
  }
  return ['APPROVE', 'REJECT', ...actions];
}

function parseBoolean(value: unknown, fallback: boolean) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  throw createHttpError(400, 'unreadOnly must be a boolean');
}

function clampInt(value: unknown, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.floor(parsed), max));
}

function readParamId(req: AuthRequest, key: string) {
  const raw = req.params?.[key];
  if (Array.isArray(raw)) return String(raw[0] || '').trim();
  return String(raw || '').trim();
}

export const notificationController = {
  list: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      if (!userId) throw createHttpError(401, 'Unauthorized');

      const unreadOnly = parseBoolean(req.query.unreadOnly, false);
      const limit = clampInt(req.query.limit, 50, 100);
      const page = clampInt(req.query.page, 1, 100_000);
      const skip = (page - 1) * limit;

      const filter: Record<string, unknown> = {
        recipient_user_id: userId,
      };
      if (unreadOnly) filter.is_read = false;

      const [data, total] = await Promise.all([
        NotificationModel.find(filter).sort({ created_at: -1 }).skip(skip).limit(limit).lean(),
        NotificationModel.countDocuments(filter),
      ]);

      const approvalRecordIds = Array.from(
        new Set(
          data
            .filter(
              (notification: any) =>
                String(notification?.type || '') === 'APPROVAL_REQUESTED'
                && String(notification?.entity_type || '') === 'Record'
            )
            .map((notification: any) => String(notification?.entity_id || '').trim())
            .filter((id) => Types.ObjectId.isValid(id))
        )
      );
      let pendingApprovalRecordIds = new Set<string>();
      if (approvalRecordIds.length > 0) {
        const pendingRows = await ApprovalRequestModel.find(
          {
            record_id: { $in: approvalRecordIds },
            status: 'Pending',
          },
          { record_id: 1 }
        )
          .lean()
          .exec();
        pendingApprovalRecordIds = new Set(
          pendingRows.map((row: any) => String(row?.record_id || '').trim()).filter(Boolean)
        );
      }

      const mapped = data.map((notification: any) => ({
        ...notification,
        available_actions: getAvailableActions(notification, pendingApprovalRecordIds),
        open_path: buildOpenPath(String(notification.entity_type || ''), String(notification.entity_id || '')),
      }));

      return res.json({
        data: mapped,
        page,
        limit,
        total,
      });
    } catch (error) {
      return next(error);
    }
  },

  markRead: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      if (!userId) throw createHttpError(401, 'Unauthorized');
      const notificationId = readParamId(req, 'id');
      if (!Types.ObjectId.isValid(notificationId)) {
        throw createHttpError(400, 'id is invalid');
      }

      const updated = await NotificationModel.findOneAndUpdate(
        { _id: notificationId, recipient_user_id: userId },
        { $set: { is_read: true } },
        { new: true }
      ).lean();

      if (!updated) {
        throw createHttpError(404, 'Notification not found');
      }
      return res.json(updated);
    } catch (error) {
      return next(error);
    }
  },

  markAllRead: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      if (!userId) throw createHttpError(401, 'Unauthorized');

      const result = await NotificationModel.updateMany(
        { recipient_user_id: userId, is_read: false },
        { $set: { is_read: true } }
      );

      return res.json({
        matched: result.matchedCount,
        modified: result.modifiedCount,
      });
    } catch (error) {
      return next(error);
    }
  },

  action: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      if (!userId) throw createHttpError(401, 'Unauthorized');

      const notificationId = readParamId(req, 'id');
      if (!Types.ObjectId.isValid(notificationId)) {
        throw createHttpError(400, 'id is invalid');
      }
      const action = parseAction(req.body?.action);
      const notification: any = await NotificationModel.findOne({
        _id: notificationId,
        recipient_user_id: userId,
      });
      if (!notification) {
        throw createHttpError(404, 'Notification not found');
      }

      let approvalResult: any = null;
      if (action === 'APPROVE' || action === 'REJECT') {
        if (String(notification.type || '') !== 'APPROVAL_REQUESTED') {
          throw createHttpError(400, 'This notification does not support approval actions');
        }
        if (String(notification.entity_type || '') !== 'Record') {
          throw createHttpError(400, 'Approval actions are only valid for record notifications');
        }
        if (isApprovalActionAlreadyTaken(notification)) {
          throw createHttpError(409, 'Approval action already applied for this notification');
        }
        const recordId = String(notification.entity_id || '');
        const approval: any = await ApprovalRequestModel.findOne({
          record_id: recordId,
          status: 'Pending',
        })
          .sort({ requested_at: -1 })
          .exec();
        if (!approval?._id) {
          throw createHttpError(409, 'No pending approval found for this notification');
        }

        const ctx = await getRequestContext(req);
        approvalResult = await decideApproval(ctx, String(approval._id), {
          decision: action === 'APPROVE' ? 'Approved' : 'Rejected',
          decisionNotes: String(req.body?.decisionNotes || '').trim() || undefined,
        });
      }

      notification.is_read = true;
      notification.last_action = action;
      notification.last_action_at = new Date();
      if (action === 'ACKNOWLEDGE') {
        notification.acknowledged_at = new Date();
      }
      await notification.save();

      return res.json({
        notification,
        action,
        openPath: buildOpenPath(String(notification.entity_type || ''), String(notification.entity_id || '')),
        approval: approvalResult,
      });
    } catch (error) {
      return next(error);
    }
  },
};


