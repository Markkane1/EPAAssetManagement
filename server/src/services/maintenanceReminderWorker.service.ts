import { AssetItemModel } from '../models/assetItem.model';
import { MaintenanceRecordModel } from '../models/maintenanceRecord.model';
import { getAssetItemOfficeId } from '../utils/assetHolder';
import { createBulkNotifications, resolveNotificationRecipientsByOffice } from './notification.service';

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

async function notifyMaintenanceEvent(input: {
  maintenanceRecord: any;
  officeId: string;
  type: 'MAINTENANCE_DUE' | 'MAINTENANCE_OVERDUE';
  title: string;
  message: string;
}) {
  const recordId = toRecordId(input.maintenanceRecord);
  if (!recordId) return;

  const recipients = await resolveNotificationRecipientsByOffice({
    officeIds: [input.officeId],
    includeOrgAdmins: true,
    includeRoles: ['office_head', 'caretaker'],
  });
  if (recipients.length === 0) return;

  await createBulkNotifications(
    recipients.map((recipientUserId) => ({
      recipientUserId,
      officeId: input.officeId,
      type: input.type,
      title: input.title,
      message: input.message,
      entityType: 'MaintenanceRecord',
      entityId: recordId,
      dedupeWindowHours: 24,
    }))
  );
}

export async function runMaintenanceReminderWorker() {
  const now = Date.now();
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
  const dueSoonCutoff = new Date(now + threeDaysMs);

  const records: any[] = await MaintenanceRecordModel.find(
    {
      maintenance_status: 'Scheduled',
      is_active: { $ne: false },
      scheduled_date: { $ne: null, $lte: dueSoonCutoff },
    },
    { _id: 1, asset_item_id: 1, scheduled_date: 1 }
  )
    .sort({ scheduled_date: 1 })
    .limit(5_000)
    .lean()
    .exec();
  if (records.length === 0) return;

  const assetItemIds = Array.from(
    new Set(records.map((record) => String(record.asset_item_id || '')).filter(Boolean))
  );
  if (assetItemIds.length === 0) return;

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

  await Promise.all(
    records.map(async (record) => {
      const officeId = officeByAssetItemId.get(String(record.asset_item_id || ''));
      if (!officeId) return;

      const scheduledDateRaw = record?.scheduled_date;
      const scheduledDate = scheduledDateRaw ? new Date(String(scheduledDateRaw)).getTime() : Number.NaN;
      if (!Number.isFinite(scheduledDate)) return;

      if (scheduledDate < now) {
        await notifyMaintenanceEvent({
          maintenanceRecord: record,
          officeId,
          type: 'MAINTENANCE_OVERDUE',
          title: 'Maintenance Overdue',
          message: `Maintenance is overdue since ${toIsoDateLabel(scheduledDateRaw)}.`,
        });
        return;
      }

      if (scheduledDate - now <= threeDaysMs) {
        await notifyMaintenanceEvent({
          maintenanceRecord: record,
          officeId,
          type: 'MAINTENANCE_DUE',
          title: 'Maintenance Due Soon',
          message: `Maintenance is due on ${toIsoDateLabel(scheduledDateRaw)}.`,
        });
      }
    })
  );
}
