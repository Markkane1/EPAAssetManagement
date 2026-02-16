import { Types } from 'mongoose';
import { createHttpError } from '../utils/httpError';
import { NotificationModel } from '../models/notification.model';
import { UserModel } from '../models/user.model';

const NOTIFICATION_TYPES = new Set([
  'ASSIGNMENT_DRAFT_CREATED',
  'HANDOVER_SLIP_READY',
  'ASSIGNMENT_ISSUED',
  'RETURN_REQUESTED',
  'RETURN_SLIP_READY',
  'ASSIGNMENT_RETURNED',
]);

const NOTIFICATION_ENTITY_TYPES = new Set(['Assignment', 'Requisition']);

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

export async function createNotification(input: NotificationCreateInput) {
  const payload = validateCreateInput(input);
  if (!payload) return null;

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

  const recipientIds = Array.from(new Set(normalized.map((row) => row.recipient_user_id)));
  const existingRecipients = await UserModel.find(
    { _id: { $in: recipientIds } },
    { _id: 1 }
  )
    .lean()
    .exec();
  const existingRecipientSet = new Set(existingRecipients.map((doc) => String(doc._id)));

  const insertable = normalized.filter((row) => existingRecipientSet.has(String(row.recipient_user_id)));
  if (insertable.length === 0) return [];

  return NotificationModel.insertMany(insertable, { ordered: false });
}

