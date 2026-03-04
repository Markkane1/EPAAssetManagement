import { Types } from 'mongoose';
import { createHttpError } from '../utils/httpError';
import { NotificationModel } from '../models/notification.model';
import { UserModel } from '../models/user.model';
import { SystemSettingsModel } from '../models/systemSettings.model';
import { buildUserRoleMatchFilter } from '../utils/roles';

const NOTIFICATION_TYPES = new Set([
  'ASSIGNMENT_DRAFT_CREATED',
  'HANDOVER_SLIP_READY',
  'ASSIGNMENT_ISSUED',
  'RETURN_REQUESTED',
  'RETURN_SLIP_READY',
  'ASSIGNMENT_RETURNED',
  'ASSIGNMENT_CANCELLED',
  'TRANSFER_REQUESTED',
  'TRANSFER_APPROVED',
  'TRANSFER_REJECTED',
  'TRANSFER_DISPATCHED',
  'TRANSFER_RECEIVED',
  'TRANSFER_CANCELLED',
  'MAINTENANCE_SCHEDULED',
  'MAINTENANCE_DUE',
  'MAINTENANCE_OVERDUE',
  'MAINTENANCE_COMPLETED',
  'MAINTENANCE_UPDATED',
  'MAINTENANCE_REMOVED',
  'LOW_STOCK_ALERT',
  'WARRANTY_EXPIRY_ALERT',
  'REQUISITION_SUBMITTED',
  'REQUISITION_APPROVED',
  'REQUISITION_FULFILLED',
  'REQUISITION_STATUS_CHANGED',
  'REQUISITION_VERIFIED',
  'REQUISITION_REJECTED',
  'REQUISITION_ADJUSTED',
  'REQUISITION_LINE_MAPPED',
  'REQUISITION_ISSUANCE_SIGNED',
  'RETURN_REQUEST_SUBMITTED',
  'RETURN_REQUEST_RECEIVED',
  'RETURN_REQUEST_CLOSED',
  'CONSUMABLE_RECEIVED',
  'CONSUMABLE_TRANSFERRED',
  'CONSUMABLE_CONSUMED',
  'CONSUMABLE_ADJUSTED',
  'CONSUMABLE_DISPOSED',
  'CONSUMABLE_RETURNED',
  'CONSUMABLE_OPENING_BALANCE',
  'CONSUMABLE_ISSUED',
  'APPROVAL_REQUESTED',
  'APPROVAL_DECIDED',
  'PURCHASE_ORDER_CREATED',
  'PURCHASE_ORDER_STATUS_CHANGED',
  'PURCHASE_ORDER_REMOVED',
  'EMPLOYEE_TRANSFERRED',
  'ROLE_DELEGATED',
  'ROLE_DELEGATION_REVOKED',
]);

const NOTIFICATION_ENTITY_TYPES = new Set([
  'Assignment',
  'Requisition',
  'Transfer',
  'MaintenanceRecord',
  'AssetItem',
  'ConsumableItem',
  'ReturnRequest',
  'Record',
  'PurchaseOrder',
  'Employee',
  'RoleDelegation',
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
  ASSIGNMENT_CANCELLED: 'assignment_notifications',
  REQUISITION_SUBMITTED: 'assignment_notifications',
  REQUISITION_APPROVED: 'assignment_notifications',
  REQUISITION_FULFILLED: 'assignment_notifications',
  REQUISITION_STATUS_CHANGED: 'assignment_notifications',
  REQUISITION_VERIFIED: 'assignment_notifications',
  REQUISITION_REJECTED: 'assignment_notifications',
  REQUISITION_ADJUSTED: 'assignment_notifications',
  REQUISITION_LINE_MAPPED: 'assignment_notifications',
  REQUISITION_ISSUANCE_SIGNED: 'assignment_notifications',
  TRANSFER_REQUESTED: 'assignment_notifications',
  TRANSFER_APPROVED: 'assignment_notifications',
  TRANSFER_REJECTED: 'assignment_notifications',
  TRANSFER_DISPATCHED: 'assignment_notifications',
  TRANSFER_RECEIVED: 'assignment_notifications',
  TRANSFER_CANCELLED: 'assignment_notifications',
  RETURN_REQUEST_SUBMITTED: 'assignment_notifications',
  RETURN_REQUEST_RECEIVED: 'assignment_notifications',
  RETURN_REQUEST_CLOSED: 'assignment_notifications',
  CONSUMABLE_RECEIVED: 'assignment_notifications',
  CONSUMABLE_TRANSFERRED: 'assignment_notifications',
  CONSUMABLE_CONSUMED: 'assignment_notifications',
  CONSUMABLE_ADJUSTED: 'assignment_notifications',
  CONSUMABLE_DISPOSED: 'assignment_notifications',
  CONSUMABLE_RETURNED: 'assignment_notifications',
  CONSUMABLE_OPENING_BALANCE: 'assignment_notifications',
  CONSUMABLE_ISSUED: 'assignment_notifications',
  APPROVAL_REQUESTED: 'assignment_notifications',
  APPROVAL_DECIDED: 'assignment_notifications',
  PURCHASE_ORDER_CREATED: 'assignment_notifications',
  PURCHASE_ORDER_STATUS_CHANGED: 'assignment_notifications',
  PURCHASE_ORDER_REMOVED: 'assignment_notifications',
  EMPLOYEE_TRANSFERRED: 'assignment_notifications',
  ROLE_DELEGATED: 'assignment_notifications',
  ROLE_DELEGATION_REVOKED: 'assignment_notifications',
  MAINTENANCE_SCHEDULED: 'maintenance_reminders',
  MAINTENANCE_DUE: 'maintenance_reminders',
  MAINTENANCE_OVERDUE: 'maintenance_reminders',
  MAINTENANCE_COMPLETED: 'maintenance_reminders',
  MAINTENANCE_UPDATED: 'maintenance_reminders',
  MAINTENANCE_REMOVED: 'maintenance_reminders',
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
  dedupeWindowHours?: number | null;
};

type ValidatedNotificationPayload = {
  recipient_user_id: string;
  office_id: string;
  type: string;
  title: string;
  message: string;
  entity_type: string;
  entity_id: string;
  dedupe_window_hours: number | null;
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
  const dedupeWindowHours = Number(input?.dedupeWindowHours);
  const normalizedDedupeWindowHours =
    Number.isFinite(dedupeWindowHours) && dedupeWindowHours > 0 ? Math.floor(dedupeWindowHours) : null;

  return {
    recipient_user_id: recipientUserId,
    office_id: officeId,
    type,
    title,
    message,
    entity_type: entityType,
    entity_id: entityId,
    dedupe_window_hours: normalizedDedupeWindowHours,
  } satisfies ValidatedNotificationPayload;
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

function toInsertablePayload(payload: ValidatedNotificationPayload) {
  const { dedupe_window_hours: _dedupeWindowHours, ...insertable } = payload;
  return insertable;
}

async function isDuplicateNotification(payload: ValidatedNotificationPayload) {
  if (!payload.dedupe_window_hours) return false;
  const createdAfter = new Date(Date.now() - payload.dedupe_window_hours * 60 * 60 * 1000);
  const existing = await NotificationModel.exists({
    recipient_user_id: payload.recipient_user_id,
    office_id: payload.office_id,
    type: payload.type,
    entity_type: payload.entity_type,
    entity_id: payload.entity_id,
    created_at: { $gte: createdAfter },
  });
  return Boolean(existing);
}

function normalizeUniqueObjectIds(list: string[]) {
  return Array.from(
    new Set(
      list
        .map((entry) => String(entry || '').trim())
        .filter((entry) => Types.ObjectId.isValid(entry))
    )
  );
}

export async function resolveNotificationRecipientsByOffice(input: {
  officeIds?: string[];
  includeOrgAdmins?: boolean;
  includeRoles?: string[];
  includeUserIds?: string[];
  excludeUserIds?: string[];
}) {
  const includeOrgAdmins = input.includeOrgAdmins !== false;
  const officeIds = normalizeUniqueObjectIds(input.officeIds || []);
  const includeRoles = Array.from(
    new Set(
      (input.includeRoles || ['office_head', 'caretaker'])
        .map((role) => String(role || '').trim().toLowerCase())
        .filter(Boolean)
    )
  );
  const includeUserIds = normalizeUniqueObjectIds(input.includeUserIds || []);
  const excludeUserIds = new Set(normalizeUniqueObjectIds(input.excludeUserIds || []));

  const roleFilters: Record<string, unknown>[] = [];
  if (includeRoles.length > 0 && officeIds.length > 0) {
    roleFilters.push({
      ...buildUserRoleMatchFilter(includeRoles),
      location_id: { $in: officeIds },
    });
  }
  if (includeOrgAdmins) {
    roleFilters.push(buildUserRoleMatchFilter(['org_admin']));
  }
  if (includeUserIds.length > 0) {
    roleFilters.push({ _id: { $in: includeUserIds } });
  }
  if (roleFilters.length === 0) {
    return [] as string[];
  }

  const users = await UserModel.find(
    {
      is_active: true,
      $or: roleFilters,
    },
    { _id: 1 }
  )
    .lean()
    .exec();

  const recipients = Array.from(new Set(users.map((user) => String(user._id))));
  return recipients.filter((id) => !excludeUserIds.has(id));
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
  const isDuplicate = await isDuplicateNotification(payload);
  if (isDuplicate) return null;

  return NotificationModel.create(toInsertablePayload(payload));
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
  const duplicateFlags = await Promise.all(enabledRows.map((row) => isDuplicateNotification(row)));
  const dedupedRows = enabledRows.filter((_, index) => !duplicateFlags[index]);
  if (dedupedRows.length === 0) return [];

  const recipientIds = Array.from(new Set(dedupedRows.map((row) => row.recipient_user_id)));
  const existingRecipients = await UserModel.find(
    { _id: { $in: recipientIds } },
    { _id: 1 }
  )
    .lean()
    .exec();
  const existingRecipientSet = new Set(existingRecipients.map((doc) => String(doc._id)));

  const insertable = dedupedRows
    .filter((row) => existingRecipientSet.has(String(row.recipient_user_id)))
    .map((row) => toInsertablePayload(row));
  if (insertable.length === 0) return [];

  return NotificationModel.insertMany(insertable, { ordered: false });
}
