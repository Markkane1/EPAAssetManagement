import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

async function main() {
  const mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
    instanceOpts: [{ launchTimeout: 30000 }],
  });
  process.env.NODE_ENV = 'test';
  process.env.MONGO_URI = mongo.getUri();
  process.env.JWT_SECRET = '0123456789abcdef0123456789abcdef';
  process.env.CORS_ORIGIN = 'http://localhost:5173';
  process.env.JWT_EXPIRES_IN = '7d';
  process.env.SEED_SUPER_ADMIN = 'false';

  const { connectDatabase } = await import('../../../../server/src/config/db');
  const { OfficeModel } = await import('../../../../server/src/models/office.model');
  const { UserModel } = await import('../../../../server/src/models/user.model');
  const { AssetModel } = await import('../../../../server/src/models/asset.model');
  const { AssetItemModel } = await import('../../../../server/src/models/assetItem.model');
  const { MaintenanceRecordModel } = await import('../../../../server/src/models/maintenanceRecord.model');
  const { NotificationModel } = await import('../../../../server/src/models/notification.model');
  const { SystemSettingsModel } = await import('../../../../server/src/models/systemSettings.model');
  const { ConsumableItemModel } = await import('../../../../server/src/modules/consumables/models/consumableItem.model');
  const { ConsumableInventoryBalanceModel } = await import(
    '../../../../server/src/modules/consumables/models/consumableInventoryBalance.model'
  );
  const { runMaintenanceReminderWorker } = await import('../../../../server/src/services/maintenanceReminderWorker.service');
  const { runThresholdAlertWorker } = await import('../../../../server/src/services/thresholdAlertWorker.service');

  await connectDatabase();

  const office = await OfficeModel.create({
    name: 'Worker Test Office',
    type: 'DISTRICT_LAB',
  });

  const passwordHash = await bcrypt.hash('Passw0rd!', 10);
  const officeHead = await UserModel.create({
    email: 'worker-office-head@example.com',
    password_hash: passwordHash,
    role: 'office_head',
    first_name: 'Worker',
    last_name: 'Head',
    location_id: office._id,
  });
  await SystemSettingsModel.create({
    notifications: {
      warranty_expiry_alerts: true,
    },
  });

  const asset = await AssetModel.create({
    name: 'Worker Test Asset',
    quantity: 1,
    unit_price: 25000,
  });
  const warrantyExpirySoon = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  const assetItem = await AssetItemModel.create({
    asset_id: asset._id,
    holder_type: 'OFFICE',
    holder_id: office._id,
    assignment_status: 'Unassigned',
    item_status: 'Available',
    warranty_expiry: warrantyExpirySoon,
    is_active: true,
  });

  const maintenanceDatePast = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  await MaintenanceRecordModel.create({
    asset_item_id: assetItem._id,
    maintenance_type: 'Preventive',
    maintenance_status: 'Scheduled',
    scheduled_date: maintenanceDatePast,
    description: 'Scheduled maintenance',
    performed_by: 'Vendor',
    is_active: true,
  });

  const lowStockItem = await ConsumableItemModel.create({
    name: 'Low Stock Item',
    base_uom: 'EA',
    default_min_stock: 10,
  });
  await ConsumableInventoryBalanceModel.create({
    holder_type: 'OFFICE',
    holder_id: office._id,
    consumable_item_id: lowStockItem._id,
    lot_id: null,
    qty_on_hand_base: 5,
    qty_reserved_base: 0,
  });

  await runMaintenanceReminderWorker();
  await runThresholdAlertWorker();

  const notifications = await NotificationModel.find(
    { recipient_user_id: officeHead._id },
    { type: 1, entity_type: 1, entity_id: 1 }
  )
    .lean()
    .exec();
  const types = notifications.map((row: any) => String(row.type || ''));

  assert.equal(types.includes('MAINTENANCE_OVERDUE'), true, 'Expected maintenance overdue notification');
  assert.equal(types.includes('LOW_STOCK_ALERT'), true, 'Expected low stock notification');
  assert.equal(types.includes('WARRANTY_EXPIRY_ALERT'), true, 'Expected warranty expiry notification');

  await mongoose.disconnect();
  await mongo.stop();
  console.log('Scheduler workers runtime test passed.');
}

main().catch(async (error) => {
  console.error('Scheduler workers runtime test failed.');
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore cleanup errors
  }
  process.exit(1);
});
