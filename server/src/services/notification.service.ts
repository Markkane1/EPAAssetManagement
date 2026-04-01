import { Types } from 'mongoose';
import { createHttpError } from '../utils/httpError';
import { NotificationModel } from '../models/notification.model';
import { UserModel } from '../models/user.model';
import { SystemSettingsModel } from '../models/systemSettings.model';
import { OFFICE_ADMIN_ROLE_VALUES, buildUserRoleMatchFilter } from '../utils/roles';
import {
  NOTIFICATION_TYPES_SET,
  NOTIFICATION_ENTITY_TYPES_SET,
} from '../constants/notificationTypes';

const NOTIFICATION_TYPES = NOTIFICATION_TYPES_SET;
const NOTIFICATION_ENTITY_TYPES = NOTIFICATION_ENTITY_TYPES_SET;

type NotificationPreferenceKey =
  | 'low_stock_alerts'
  | 'maintenance_reminders'
  | 'assignment_notifications'
  | 'warranty_expiry_alerts'
  | 'consumable_notifications'
  | 'purchase_order_notifications';

type NotificationSettingsSnapshot = {
  low_stock_alerts: boolean;
  maintenance_reminders: boolean;
  assignment_notifications: boolean;
  warranty_expiry_alerts: boolean;
  consumable_notifications: boolean;
  purchase_order_notifications: boolean;
};

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettingsSnapshot = {
  low_stock_alerts: true,
  maintenance_reminders: true,
  assignment_notifications: true,
  warranty_expiry_alerts: false,
  consumable_notifications: true,
  purchase_order_notifications: true,
};
const NOTIFICATION_SETTINGS_CACHE_TTL_MS = 30_000;
let cachedNotificationSettings: { expiresAt: number; snapshot: NotificationSettingsSnapshot } | null = null;
let notificationSettingsInFlight: Promise<NotificationSettingsSnapshot> | null = null;

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
  CONSUMABLE_RECEIVED: 'consumable_notifications',
  CONSUMABLE_TRANSFERRED: 'consumable_notifications',
  CONSUMABLE_CONSUMED: 'consumable_notifications',
  CONSUMABLE_ADJUSTED: 'consumable_notifications',
  CONSUMABLE_DISPOSED: 'consumable_notifications',
  CONSUMABLE_RETURNED: 'consumable_notifications',
  CONSUMABLE_OPENING_BALANCE: 'consumable_notifications',
  CONSUMABLE_ISSUED: 'consumable_notifications',
  APPROVAL_REQUESTED: 'assignment_notifications',
  APPROVAL_DECIDED: 'assignment_notifications',
  PURCHASE_ORDER_CREATED: 'purchase_order_notifications',
  PURCHASE_ORDER_STATUS_CHANGED: 'purchase_order_notifications',
  PURCHASE_ORDER_REMOVED: 'purchase_order_notifications',
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

function sanitizeNotificationSettings(settings: any) {
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
    consumable_notifications: asBoolean(
      notifications.consumable_notifications,
      DEFAULT_NOTIFICATION_SETTINGS.consumable_notifications
    ),
    purchase_order_notifications: asBoolean(
      notifications.purchase_order_notifications,
      DEFAULT_NOTIFICATION_SETTINGS.purchase_order_notifications
    ),
  } satisfies NotificationSettingsSnapshot;
}

async function readNotificationSettingsSnapshotFromDb() {
  const settings: any = await SystemSettingsModel.findOne({}, { notifications: 1 }).lean().exec();
  return sanitizeNotificationSettings(settings);
}

export function invalidateNotificationSettingsCache() {
  cachedNotificationSettings = null;
  notificationSettingsInFlight = null;
}

async function getNotificationSettingsSnapshot(options?: { forceRefresh?: boolean }) {
  const now = Date.now();
  if (!options?.forceRefresh && cachedNotificationSettings && cachedNotificationSettings.expiresAt > now) {
    return cachedNotificationSettings.snapshot;
  }

  if (!options?.forceRefresh && notificationSettingsInFlight) {
    return notificationSettingsInFlight;
  }

  const loadPromise = readNotificationSettingsSnapshotFromDb()
    .then((snapshot) => {
      cachedNotificationSettings = {
        snapshot,
        expiresAt: Date.now() + NOTIFICATION_SETTINGS_CACHE_TTL_MS,
      };
      return snapshot;
    })
    .finally(() => {
      if (notificationSettingsInFlight === loadPromise) {
        notificationSettingsInFlight = null;
      }
    });

  notificationSettingsInFlight = loadPromise;
  return loadPromise;
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

type NotificationRecipientResolutionInput = {
  officeIds?: string[];
  includeOrgAdmins?: boolean;
  includeRoles?: string[];
  includeUserIds?: string[];
  excludeUserIds?: string[];
};

type NormalizedRecipientResolutionInput = {
  includeOrgAdmins: boolean;
  officeIds: string[];
  includeRoles: string[];
  includeUserIds: string[];
  excludeUserIds: Set<string>;
};

function normalizeRecipientResolutionInput(
  input: NotificationRecipientResolutionInput
): NormalizedRecipientResolutionInput {
  const includeOrgAdmins = input.includeOrgAdmins !== false;
  const officeIds = normalizeUniqueObjectIds(input.officeIds || []);
  const includeRoles = Array.from(
    new Set(
      (input.includeRoles || ['office_head', 'caretaker'])
        .flatMap((role) =>
          String(role || '').trim().toLowerCase() === 'office_head'
            ? [...OFFICE_ADMIN_ROLE_VALUES]
            : [role]
        )
        .map((role) => String(role || '').trim().toLowerCase())
        .filter(Boolean)
    )
  );
  const includeUserIds = normalizeUniqueObjectIds(input.includeUserIds || []);
  const excludeUserIds = new Set(normalizeUniqueObjectIds(input.excludeUserIds || []));

  return {
    includeOrgAdmins,
    officeIds,
    includeRoles,
    includeUserIds,
    excludeUserIds,
  };
}

function buildRecipientRoleFilters(input: NormalizedRecipientResolutionInput) {
  const roleFilters: Record<string, unknown>[] = [];
  if (input.includeRoles.length > 0 && input.officeIds.length > 0) {
    roleFilters.push({
      ...buildUserRoleMatchFilter(input.includeRoles),
      location_id: { $in: input.officeIds },
    });
  }
  if (input.includeOrgAdmins) {
    roleFilters.push(buildUserRoleMatchFilter(['org_admin']));
  }
  if (input.includeUserIds.length > 0) {
    roleFilters.push({ _id: { $in: input.includeUserIds } });
  }
  return roleFilters;
}

function userHasRole(user: { role?: unknown; roles?: unknown[] }, role: string) {
  const normalizedRole = String(user.role || '').trim().toLowerCase();
  if (normalizedRole === role) return true;
  if (!Array.isArray(user.roles)) return false;
  return user.roles.some((entry) => String(entry || '').trim().toLowerCase() === role);
}

export async function resolveNotificationRecipientsByOfficeMap(input: NotificationRecipientResolutionInput) {
  const normalized = normalizeRecipientResolutionInput(input);
  const recipientSets = new Map<string, Set<string>>(
    normalized.officeIds.map((officeId) => [officeId, new Set<string>()])
  );

  if (normalized.officeIds.length === 0) {
    return new Map<string, string[]>();
  }

  const roleFilters = buildRecipientRoleFilters(normalized);
  if (roleFilters.length === 0) {
    return new Map(
      normalized.officeIds.map((officeId) => [officeId, [] as string[]])
    );
  }

  const users = await UserModel.find(
    {
      is_active: true,
      $or: roleFilters,
    },
    { _id: 1, location_id: 1, role: 1, roles: 1 }
  )
    .lean()
    .exec();

  users.forEach((user: any) => {
    const recipientId = String(user._id || '').trim();
    if (!recipientId || normalized.excludeUserIds.has(recipientId)) return;

    const isExplicitRecipient = normalized.includeUserIds.includes(recipientId);
    const isOrgAdminRecipient = normalized.includeOrgAdmins && userHasRole(user, 'org_admin');

    if (isExplicitRecipient || isOrgAdminRecipient) {
      normalized.officeIds.forEach((officeId) => {
        recipientSets.get(officeId)?.add(recipientId);
      });
      return;
    }

    const locationId = String(user.location_id || '').trim();
    if (!locationId) return;
    recipientSets.get(locationId)?.add(recipientId);
  });

  return new Map(
    Array.from(recipientSets.entries()).map(([officeId, recipients]) => [officeId, Array.from(recipients)])
  );
}

export async function resolveNotificationRecipientsByOffice(input: NotificationRecipientResolutionInput) {
  const normalized = normalizeRecipientResolutionInput(input);
  if (normalized.officeIds.length > 0) {
    const recipientMap = await resolveNotificationRecipientsByOfficeMap(input);
    return Array.from(
      new Set(
        Array.from(recipientMap.values()).flatMap((recipients) => recipients)
      )
    );
  }

  const roleFilters = buildRecipientRoleFilters(normalized);
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
  return recipients.filter((id) => !normalized.excludeUserIds.has(id));
}

function buildNotificationIdentityKey(payload: {
  recipient_user_id: string;
  office_id: string;
  type: string;
  entity_type: string;
  entity_id: string;
}) {
  return [
    payload.recipient_user_id,
    payload.office_id,
    payload.type,
    payload.entity_type,
    payload.entity_id,
  ].join('|');
}

async function filterDuplicateNotifications(payloads: ValidatedNotificationPayload[]) {
  if (payloads.length === 0) return [] as ValidatedNotificationPayload[];

  const dedupeRows = payloads.filter((row) => row.dedupe_window_hours);
  if (dedupeRows.length === 0) return payloads;

  const earliestCreatedAfter = new Date(
    Math.min(
      ...dedupeRows.map((row) => Date.now() - Number(row.dedupe_window_hours || 0) * 60 * 60 * 1000)
    )
  );

  const identityFilters = Array.from(
    new Map(
      dedupeRows.map((row) => [
        buildNotificationIdentityKey(row),
        {
          recipient_user_id: row.recipient_user_id,
          office_id: row.office_id,
          type: row.type,
          entity_type: row.entity_type,
          entity_id: row.entity_id,
        },
      ])
    ).values()
  );

  const existingRows =
    identityFilters.length > 0
      ? await NotificationModel.find(
          {
            created_at: { $gte: earliestCreatedAfter },
            $or: identityFilters,
          },
          {
            recipient_user_id: 1,
            office_id: 1,
            type: 1,
            entity_type: 1,
            entity_id: 1,
            created_at: 1,
          }
        )
          .lean()
          .exec()
      : [];

  const latestCreatedAtByIdentity = new Map<string, number>();
  existingRows.forEach((row: any) => {
    const key = buildNotificationIdentityKey({
      recipient_user_id: String(row.recipient_user_id || ''),
      office_id: String(row.office_id || ''),
      type: String(row.type || ''),
      entity_type: String(row.entity_type || ''),
      entity_id: String(row.entity_id || ''),
    });
    const createdAt = new Date(String(row.created_at || '')).getTime();
    if (!Number.isFinite(createdAt)) return;
    const previous = latestCreatedAtByIdentity.get(key) || 0;
    if (createdAt > previous) {
      latestCreatedAtByIdentity.set(key, createdAt);
    }
  });

  const seenBatchKeys = new Set<string>();
  return payloads.filter((row) => {
    if (!row.dedupe_window_hours) return true;

    const identityKey = buildNotificationIdentityKey(row);
    const batchKey = `${identityKey}|${row.dedupe_window_hours}`;
    if (seenBatchKeys.has(batchKey)) {
      return false;
    }
    seenBatchKeys.add(batchKey);

    const latestCreatedAt = latestCreatedAtByIdentity.get(identityKey);
    if (!latestCreatedAt) return true;

    const createdAfter = Date.now() - row.dedupe_window_hours * 60 * 60 * 1000;
    return latestCreatedAt < createdAfter;
  });
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
  const dedupedRows = await filterDuplicateNotifications(enabledRows);
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
