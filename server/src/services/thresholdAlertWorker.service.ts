import { AssetItemModel } from '../models/assetItem.model';
import { ConsumableInventoryBalanceModel } from '../modules/consumables/models/consumableInventoryBalance.model';
import { ConsumableItemModel } from '../modules/consumables/models/consumableItem.model';
import { createBulkNotifications, resolveNotificationRecipientsByOfficeMap } from './notification.service';

const WARRANTY_ALERT_BATCH_SIZE = 250;

type ThresholdNotificationSeed = {
  officeId: string;
  type: 'LOW_STOCK_ALERT' | 'WARRANTY_EXPIRY_ALERT';
  title: string;
  message: string;
  entityType: 'ConsumableItem' | 'AssetItem';
  entityId: string;
  dedupeWindowHours: number;
};

type WarrantySeedCursor = {
  warrantyExpiry: Date;
  id: string;
} | null;

function toExactDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getTime());
  }
  const parsed = value ? new Date(String(value)) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

async function buildOfficeRecipientMap(officeIds: string[]) {
  return resolveNotificationRecipientsByOfficeMap({
    officeIds,
    includeOrgAdmins: true,
    includeRoles: ['office_head', 'caretaker'],
  });
}

async function collectLowStockNotificationSeeds() {
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
  if (lowStockBalances.length === 0) return [] as ThresholdNotificationSeed[];

  const itemIds = Array.from(
    new Set(lowStockBalances.map((row) => String(row._id.itemId || '')).filter(Boolean))
  );
  if (itemIds.length === 0) return [] as ThresholdNotificationSeed[];

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

  return alertRows.map((row) => ({
    officeId: row.officeId,
    type: 'LOW_STOCK_ALERT',
    title: 'Low Stock Alert',
    message: `${row.itemName} is low (${row.qtyOnHandBase} remaining, threshold ${row.threshold}).`,
    entityType: 'ConsumableItem',
    entityId: row.itemId,
    dedupeWindowHours: 24,
  }));
}

async function collectWarrantyNotificationSeedBatch(cursor: WarrantySeedCursor) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 30);

  const filter: Record<string, unknown> = {
    is_active: { $ne: false },
    holder_type: 'OFFICE',
    holder_id: { $ne: null },
    warranty_expiry: { $ne: null, $lte: cutoff },
  };
  if (cursor) {
    filter.$or = [
      {
        warranty_expiry: {
          $gt: cursor.warrantyExpiry,
          $lte: cutoff,
        },
      },
      {
        warranty_expiry: cursor.warrantyExpiry,
        _id: { $gt: cursor.id },
      },
    ];
  }

  const items = await AssetItemModel.find(
    filter,
    { _id: 1, holder_id: 1, warranty_expiry: 1, tag: 1 }
  )
    .sort({ warranty_expiry: 1, _id: 1 })
    .limit(WARRANTY_ALERT_BATCH_SIZE)
    .lean()
    .exec();

  if (items.length === 0) {
    return {
      seeds: [] as ThresholdNotificationSeed[],
      nextCursor: null as WarrantySeedCursor,
    };
  }

  const now = Date.now();
  const seeds = items.flatMap<ThresholdNotificationSeed>((item: any) => {
    const officeId = String(item.holder_id || '');
    if (!officeId) return [];

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

    return [{
      officeId,
      type: 'WARRANTY_EXPIRY_ALERT',
      title: 'Warranty Expiry Alert',
      message,
      entityType: 'AssetItem',
      entityId: String(item._id),
      dedupeWindowHours: 24,
    }];
  });

  const lastItem = items[items.length - 1];
  const lastWarrantyExpiry = toExactDate(lastItem?.warranty_expiry);
  return {
    seeds,
    nextCursor:
      lastItem?._id && lastWarrantyExpiry
        ? {
            warrantyExpiry: lastWarrantyExpiry,
            id: String(lastItem._id),
          }
        : null,
  };
}

async function collectWarrantyNotificationSeeds() {
  const seeds: ThresholdNotificationSeed[] = [];
  let cursor: WarrantySeedCursor = null;

  while (true) {
    const batch = await collectWarrantyNotificationSeedBatch(cursor);
    seeds.push(...batch.seeds);
    if (!batch.nextCursor) break;
    cursor = batch.nextCursor;
  }

  return seeds;
}

export async function runThresholdAlertWorker() {
  const [lowStockSeeds, warrantySeeds] = await Promise.all([
    collectLowStockNotificationSeeds(),
    collectWarrantyNotificationSeeds(),
  ]);

  const seeds = [...lowStockSeeds, ...warrantySeeds];
  if (seeds.length === 0) return;

  const officeIds = Array.from(new Set(seeds.map((seed) => seed.officeId)));
  if (officeIds.length === 0) return;

  const recipientsByOffice = await buildOfficeRecipientMap(officeIds);
  const payload = seeds.flatMap((seed) => {
    const recipients = recipientsByOffice.get(seed.officeId) || [];
    return recipients.map((recipientUserId) => ({
      recipientUserId,
      officeId: seed.officeId,
      type: seed.type,
      title: seed.title,
      message: seed.message,
      entityType: seed.entityType,
      entityId: seed.entityId,
      dedupeWindowHours: seed.dedupeWindowHours,
    }));
  });

  if (payload.length === 0) return;
  await createBulkNotifications(payload);
}
