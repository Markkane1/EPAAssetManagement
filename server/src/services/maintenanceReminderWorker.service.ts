import { AssetItemModel } from '../models/assetItem.model';
import { MaintenanceRecordModel } from '../models/maintenanceRecord.model';
import { getAssetItemOfficeId } from '../utils/assetHolder';
import { createBulkNotifications, resolveNotificationRecipientsByOfficeMap } from './notification.service';

const MAINTENANCE_REMINDER_BATCH_SIZE = 500;

type MaintenanceReminderCursor = {
  scheduledDate: Date;
  id: string;
} | null;

function toRecordId(record: any) {
  if (record?._id) return String(record._id);
  if (record?.id) return String(record.id);
  return '';
}

function toIsoDateLabel(value: unknown) {
  const parsed = value ? new Date(String(value)) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return 'unspecified date';
  return parsed.toLocaleDateString();
}

function buildMaintenanceNotificationPayload(input: {
  maintenanceRecord: any;
  recipientUserIds: string[];
  officeId: string;
  type: 'MAINTENANCE_DUE' | 'MAINTENANCE_OVERDUE';
  title: string;
  message: string;
}) {
  const recordId = toRecordId(input.maintenanceRecord);
  if (!recordId || input.recipientUserIds.length === 0) return [];

  return input.recipientUserIds.map((recipientUserId) => ({
    recipientUserId,
    officeId: input.officeId,
    type: input.type,
    title: input.title,
    message: input.message,
    entityType: 'MaintenanceRecord',
    entityId: recordId,
    dedupeWindowHours: 24,
  }));
}

async function loadMaintenanceReminderBatch(dueSoonCutoff: Date, cursor: MaintenanceReminderCursor) {
  const filter: Record<string, unknown> = {
    maintenance_status: 'Scheduled',
    is_active: { $ne: false },
    scheduled_date: { $ne: null, $lte: dueSoonCutoff },
  };

  if (cursor) {
    filter.$or = [
      {
        scheduled_date: {
          $gt: cursor.scheduledDate,
          $lte: dueSoonCutoff,
        },
      },
      {
        scheduled_date: cursor.scheduledDate,
        _id: { $gt: cursor.id },
      },
    ];
  }

  return MaintenanceRecordModel.find(
    filter,
    { _id: 1, asset_item_id: 1, scheduled_date: 1 }
  )
    .sort({ scheduled_date: 1, _id: 1 })
    .limit(MAINTENANCE_REMINDER_BATCH_SIZE)
    .lean()
    .exec();
}

export async function runMaintenanceReminderWorker() {
  const now = Date.now();
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
  const dueSoonCutoff = new Date(now + threeDaysMs);

  const notificationsByOffice = new Map<
    string,
    Array<{
      maintenanceRecord: any;
      type: 'MAINTENANCE_DUE' | 'MAINTENANCE_OVERDUE';
      title: string;
      message: string;
    }>
  >();

  let cursor: MaintenanceReminderCursor = null;
  while (true) {
    const records = await loadMaintenanceReminderBatch(dueSoonCutoff, cursor);
    if (records.length === 0) break;

    const assetItemIds = Array.from(
      new Set(records.map((record) => String(record.asset_item_id || '')).filter(Boolean))
    );
    if (assetItemIds.length > 0) {
      const items = await AssetItemModel.find(
        { _id: { $in: assetItemIds } },
        { _id: 1, holder_type: 1, holder_id: 1, location_id: 1 }
      )
        .lean()
        .exec();
      const officeByAssetItemId = new Map<string, string>();
      items.forEach((item: any) => {
        const officeId = getAssetItemOfficeId(item);
        if (officeId) {
          officeByAssetItemId.set(String(item._id), officeId);
        }
      });

      records.forEach((record) => {
        const officeId = officeByAssetItemId.get(String(record.asset_item_id || ''));
        if (!officeId) return;

        const scheduledDateRaw = record?.scheduled_date;
        const scheduledDate = scheduledDateRaw ? new Date(String(scheduledDateRaw)).getTime() : Number.NaN;
        if (!Number.isFinite(scheduledDate)) return;

        const officeNotifications = notificationsByOffice.get(officeId) || [];
        if (scheduledDate < now) {
          officeNotifications.push({
            maintenanceRecord: record,
            type: 'MAINTENANCE_OVERDUE',
            title: 'Maintenance Overdue',
            message: `Maintenance is overdue since ${toIsoDateLabel(scheduledDateRaw)}.`,
          });
        } else if (scheduledDate - now <= threeDaysMs) {
          officeNotifications.push({
            maintenanceRecord: record,
            type: 'MAINTENANCE_DUE',
            title: 'Maintenance Due Soon',
            message: `Maintenance is due on ${toIsoDateLabel(scheduledDateRaw)}.`,
          });
        }

        if (officeNotifications.length > 0) {
          notificationsByOffice.set(officeId, officeNotifications);
        }
      });
    }

    const lastRecord = records[records.length - 1];
    const lastScheduledDate = lastRecord?.scheduled_date ? new Date(String(lastRecord.scheduled_date)) : null;
    if (!lastRecord?._id || !lastScheduledDate || Number.isNaN(lastScheduledDate.getTime())) {
      break;
    }
    cursor = {
      scheduledDate: lastScheduledDate,
      id: String(lastRecord._id),
    };
  }

  const officeIds = Array.from(notificationsByOffice.keys());
  if (officeIds.length === 0) return;

  const recipientsByOffice = await resolveNotificationRecipientsByOfficeMap({
    officeIds,
    includeOrgAdmins: true,
    includeRoles: ['office_head', 'caretaker'],
  });

  const payload = officeIds.flatMap((officeId) => {
    const recipientUserIds = recipientsByOffice.get(officeId) || [];
    const officeNotifications = notificationsByOffice.get(officeId) || [];
    return officeNotifications.flatMap((notification) =>
      buildMaintenanceNotificationPayload({
        ...notification,
        officeId,
        recipientUserIds,
      })
    );
  });

  if (payload.length === 0) return;
  await createBulkNotifications(payload);
}
