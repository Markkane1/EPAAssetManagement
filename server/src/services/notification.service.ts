import { Types } from 'mongoose';
import { createHttpError } from '../utils/httpError';
import { NotificationModel } from '../models/notification.model';
import { UserModel } from '../models/user.model';
import { SystemSettingsModel } from '../models/systemSettings.model';

const NOTIFICATION_TYPES = new Set([
  'ASSIGNMENT_DRAFT_CREATED',
  'HANDOVER_SLIP_READY',
  'ASSIGNMENT_ISSUED',
  'RETURN_REQUESTED',
  'RETURN_SLIP_READY',
  'ASSIGNMENT_RETURNED',
  'TRANSFER_REQUESTED',
  'TRANSFER_APPROVED',
  'TRANSFER_REJECTED',
  'TRANSFER_DISPATCHED',
  'TRANSFER_RECEIVED',
  'MAINTENANCE_SCHEDULED',
  'MAINTENANCE_DUE',
  'MAINTENANCE_OVERDUE',
  'MAINTENANCE_COMPLETED',
  'LOW_STOCK_ALERT',
  'WARRANTY_EXPIRY_ALERT',
  'REQUISITION_SUBMITTED',
  'REQUISITION_VERIFIED',
  'REQUISITION_REJECTED',
]);

const NOTIFICATION_ENTITY_TYPES = new Set([
  'Assignment',
  'Requisition',
  'Transfer',
  'MaintenanceRecord',
  'AssetItem',
  'ConsumableItem',
]);

type NotificationPreferenceKey =
  | 'low_stock_alerts'
  | 'maintenance_reminders'
  | 'assignment_notifications'
  | 'warranty_expiry_alerts';

type NotificationSettingsSnapshot = {
  low_stock_alerts: boolean;
  maintenance_reminders: boolean;
  assignment_notifications: boolean;
  warranty_expiry_alerts: boolean;
};

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettingsSnapshot = {
  low_stock_alerts: true,
  maintenance_reminders: true,
  assignment_notifications: true,
  warranty_expiry_alerts: false,
};

const NOTIFICATION_TYPE_TO_PREFERENCE: Record<string, NotificationPreferenceKey> = {
  ASSIGNMENT_DRAFT_CREATED: 'assignment_notifications',
  HANDOVER_SLIP_READY: 'assignment_notifications',
  ASSIGNMENT_ISSUED: 'assignment_notifications',
  RETURN_REQUESTED: 'assignment_notifications',
  RETURN_SLIP_READY: 'assignment_notifications',
  ASSIGNMENT_RETURNED: 'assignment_notifications',
  REQUISITION_SUBMITTED: 'assignment_notifications',
  REQUISITION_VERIFIED: 'assignment_notifications',
  REQUISITION_REJECTED: 'assignment_notifications',
  TRANSFER_REQUESTED: 'assignment_notifications',
  TRANSFER_APPROVED: 'assignment_notifications',
  TRANSFER_REJECTED: 'assignment_notifications',
  TRANSFER_DISPATCHED: 'assignment_notifications',
  TRANSFER_RECEIVED: 'assignment_notifications',
  MAINTENANCE_SCHEDULED: 'maintenance_reminders',
  MAINTENANCE_DUE: 'maintenance_reminders',
  MAINTENANCE_OVERDUE: 'maintenance_reminders',
  MAINTENANCE_COMPLETED: 'maintenance_reminders',
  LOW_STOCK_ALERT: 'low_stock_alerts',
  WARRANTY_EXPIRY_ALERT: 'warranty_expiry_alerts',
};

export type NotificationCreateInput = {
  recipientUserId: string;
  officeId: string;
  type: string;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
};

function asNonEmptyString(value: unknown, fieldName: string) {
  const parsed = String(value ?? '').trim();
  if (!parsed) {
    throw createHttpError(400, `${fieldName} is required`);
  }
  return parsed;
}

function asObjectId(value: unknown, fieldName: string) {
  const parsed = asNonEmptyString(value, fieldName);
  if (!Types.ObjectId.isValid(parsed)) {
    throw createHttpError(400, `${fieldName} is invalid`);
  }
  return parsed;
}

function normalizeType(value: unknown) {
  const parsed = asNonEmptyString(value, 'type');
  if (!NOTIFICATION_TYPES.has(parsed)) {
    throw createHttpError(400, 'type is invalid');
  }
  return parsed;
}

function normalizeEntityType(value: unknown) {
  const parsed = asNonEmptyString(value, 'entityType');
  if (!NOTIFICATION_ENTITY_TYPES.has(parsed)) {
    throw createHttpError(400, 'entityType is invalid');
  }
  return parsed;
}

function validateCreateInput(input: NotificationCreateInput) {
  const recipientUserId = String(input?.recipientUserId || '').trim();
  if (!recipientUserId || !Types.ObjectId.isValid(recipientUserId)) {
    return null;
  }

  const officeId = asObjectId(input.officeId, 'officeId');
  const type = normalizeType(input.type);
  const title = asNonEmptyString(input.title, 'title');
  const message = asNonEmptyString(input.message, 'message');
  const entityType = normalizeEntityType(input.entityType);
  const entityId = asObjectId(input.entityId, 'entityId');

  return {
    recipient_user_id: recipientUserId,
    office_id: officeId,
    type,
    title,
    message,
    entity_type: entityType,
    entity_id: entityId,
  };
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

async function getNotificationSettingsSnapshot() {
  const settings: any = await SystemSettingsModel.findOne({}, { notifications: 1 }).lean().exec();
  const notifications = settings?.notifications || {};
  return {
    low_stock_alerts: asBoolean(notifications.low_stock_alerts, DEFAULT_NOTIFICATION_SETTINGS.low_stock_alerts),
    maintenance_reminders: asBoolean(
      notifications.maintenance_reminders,
      DEFAULT_NOTIFICATION_SETTINGS.maintenance_reminders
    ),
    assignment_notifications: asBoolean(
      notifications.assignment_notifications,
      DEFAULT_NOTIFICATION_SETTINGS.assignment_notifications
    ),
    warranty_expiry_alerts: asBoolean(
      notifications.warranty_expiry_alerts,
      DEFAULT_NOTIFICATION_SETTINGS.warranty_expiry_alerts
    ),
  } satisfies NotificationSettingsSnapshot;
}

function isNotificationTypeEnabled(type: string, settings: NotificationSettingsSnapshot) {
  const preferenceKey = NOTIFICATION_TYPE_TO_PREFERENCE[type];
  if (!preferenceKey) return true;
  return settings[preferenceKey];
}

export async function createNotification(input: NotificationCreateInput) {
  const payload = validateCreateInput(input);
  if (!payload) return null;
  const settings = await getNotificationSettingsSnapshot();
  if (!isNotificationTypeEnabled(payload.type, settings)) {
    return null;
  }

  const recipientExists = await UserModel.exists({ _id: payload.recipient_user_id });
  if (!recipientExists) return null;

  return NotificationModel.create(payload);
}

export async function createBulkNotifications(list: NotificationCreateInput[]) {
  if (!Array.isArray(list) || list.length === 0) return [];

  const normalized = list
    .map((entry) => {
      try {
        return validateCreateInput(entry);
      } catch {
        return null;
      }
    })
    .filter((row): row is NonNullable<ReturnType<typeof validateCreateInput>> => Boolean(row));

  if (normalized.length === 0) return [];
  const settings = await getNotificationSettingsSnapshot();
  const enabledRows = normalized.filter((row) => isNotificationTypeEnabled(row.type, settings));
  if (enabledRows.length === 0) return [];

  const recipientIds = Array.from(new Set(enabledRows.map((row) => row.recipient_user_id)));
  const existingRecipients = await UserModel.find(
    { _id: { $in: recipientIds } },
    { _id: 1 }
  )
    .lean()
    .exec();
  const existingRecipientSet = new Set(existingRecipients.map((doc) => String(doc._id)));

  const insertable = enabledRows.filter((row) => existingRecipientSet.has(String(row.recipient_user_id)));
  if (insertable.length === 0) return [];

  return NotificationModel.insertMany(insertable, { ordered: false });
}
