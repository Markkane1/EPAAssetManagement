import { AssetItemModel } from '../models/assetItem.model';
import { ConsumableInventoryBalanceModel } from '../modules/consumables/models/consumableInventoryBalance.model';
import { ConsumableItemModel } from '../modules/consumables/models/consumableItem.model';
import { createBulkNotifications, resolveNotificationRecipientsByOffice } from './notification.service';

async function buildOfficeRecipientMap(officeIds: string[]) {
  const recipientMap = new Map<string, string[]>();
  await Promise.all(
    officeIds.map(async (officeId) => {
      const recipients = await resolveNotificationRecipientsByOffice({
        officeIds: [officeId],
        includeOrgAdmins: true,
        includeRoles: ['office_head', 'caretaker'],
      });
      recipientMap.set(officeId, recipients);
    })
  );
  return recipientMap;
}

async function dispatchLowStockNotifications() {
  const lowStockBalances = await ConsumableInventoryBalanceModel.aggregate<{
    _id: { officeId: string; itemId: string };
    qtyOnHandBase: number;
  }>([
    { $match: { holder_type: 'OFFICE' } },
    {
      $group: {
        _id: { officeId: '$holder_id', itemId: '$consumable_item_id' },
        qtyOnHandBase: { $sum: '$qty_on_hand_base' },
      },
    },
  ]);
  if (lowStockBalances.length === 0) return;

  const itemIds = Array.from(
    new Set(lowStockBalances.map((row) => String(row._id.itemId || '')).filter(Boolean))
  );
  if (itemIds.length === 0) return;

  const items = await ConsumableItemModel.find(
    { _id: { $in: itemIds }, is_active: { $ne: false } },
    { _id: 1, name: 1, default_min_stock: 1, default_reorder_point: 1 }
  )
    .lean()
    .exec();
  const itemById = new Map(
    items.map((item: any) => [
      String(item._id),
      {
        name: String(item.name || 'Consumable item'),
        threshold:
          Number(item.default_min_stock ?? item.default_reorder_point) > 0
            ? Number(item.default_min_stock ?? item.default_reorder_point)
            : null,
      },
    ])
  );

  const alertRows = lowStockBalances
    .map((row) => {
      const officeId = String(row._id.officeId || '');
      const itemId = String(row._id.itemId || '');
      const item = itemById.get(itemId);
      if (!officeId || !item || item.threshold == null) return null;
      const qtyOnHandBase = Number(row.qtyOnHandBase || 0);
      if (qtyOnHandBase > item.threshold) return null;
      return {
        officeId,
        itemId,
        itemName: item.name,
        qtyOnHandBase,
        threshold: item.threshold,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (alertRows.length === 0) return;
  const officeIds = Array.from(new Set(alertRows.map((row) => row.officeId)));
  const recipientsByOffice = await buildOfficeRecipientMap(officeIds);

  const payload = alertRows.flatMap((row) => {
    const recipients = recipientsByOffice.get(row.officeId) || [];
    return recipients.map((recipientUserId) => ({
      recipientUserId,
      officeId: row.officeId,
      type: 'LOW_STOCK_ALERT',
      title: 'Low Stock Alert',
      message: `${row.itemName} is low (${row.qtyOnHandBase} remaining, threshold ${row.threshold}).`,
      entityType: 'ConsumableItem',
      entityId: row.itemId,
      dedupeWindowHours: 24,
    }));
  });
  if (payload.length === 0) return;
  await createBulkNotifications(payload);
}

async function dispatchWarrantyNotifications() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 30);
  const items = await AssetItemModel.find(
    {
      is_active: { $ne: false },
      holder_type: 'OFFICE',
      holder_id: { $ne: null },
      warranty_expiry: { $ne: null, $lte: cutoff },
    },
    { _id: 1, holder_id: 1, warranty_expiry: 1, tag: 1 }
  )
    .sort({ warranty_expiry: 1 })
    .limit(2_000)
    .lean()
    .exec();

  if (items.length === 0) return;

  const officeIds = Array.from(new Set(items.map((item: any) => String(item.holder_id || '')).filter(Boolean)));
  if (officeIds.length === 0) return;
  const recipientsByOffice = await buildOfficeRecipientMap(officeIds);

  const now = Date.now();
  const payload = items.flatMap((item: any) => {
    const officeId = String(item.holder_id || '');
    const recipients = recipientsByOffice.get(officeId) || [];
    if (!officeId || recipients.length === 0) return [];

    const expiry = new Date(String(item.warranty_expiry));
    if (Number.isNaN(expiry.getTime())) return [];
    const days = Math.ceil((expiry.getTime() - now) / (24 * 60 * 60 * 1000));
    const tag = item.tag ? String(item.tag) : 'Asset item';
    const message =
      days < 0
        ? `${tag} warranty expired on ${expiry.toLocaleDateString()}.`
        : days === 0
          ? `${tag} warranty expires today.`
          : `${tag} warranty expires in ${days} day(s) on ${expiry.toLocaleDateString()}.`;

    return recipients.map((recipientUserId) => ({
      recipientUserId,
      officeId,
      type: 'WARRANTY_EXPIRY_ALERT',
      title: 'Warranty Expiry Alert',
      message,
      entityType: 'AssetItem',
      entityId: String(item._id),
      dedupeWindowHours: 24,
    }));
  });

  if (payload.length === 0) return;
  await createBulkNotifications(payload);
}

export async function runThresholdAlertWorker() {
  await Promise.all([dispatchLowStockNotifications(), dispatchWarrantyNotifications()]);
}
