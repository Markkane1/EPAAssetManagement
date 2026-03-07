import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

async function login(agent: ReturnType<typeof request.agent>, email: string, password: string) {
  const res = await agent.post('/api/auth/login').send({ email, password });
  assert.equal(res.status, 200, `Expected login to succeed for ${email}, got ${res.status}`);
}

async function main() {
  const mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  process.env.NODE_ENV = 'test';
  process.env.MONGO_URI = mongo.getUri();
  process.env.JWT_SECRET = '0123456789abcdef0123456789abcdef';
  process.env.CORS_ORIGIN = 'http://localhost:5173';
  process.env.JWT_EXPIRES_IN = '7d';
  process.env.SEED_SUPER_ADMIN = 'false';

  const { connectDatabase } = await import('../../../../server/src/config/db');
  const { createApp } = await import('../../../../server/src/app');
  const { OfficeModel } = await import('../../../../server/src/models/office.model');
  const { UserModel } = await import('../../../../server/src/models/user.model');
  const { CategoryModel } = await import('../../../../server/src/models/category.model');
  const { ConsumableUnitModel } = await import('../../../../server/src/modules/consumables/models/consumableUnit.model');
  const { ConsumableItemModel } = await import('../../../../server/src/modules/consumables/models/consumableItem.model');
  const { ConsumableLotModel } = await import('../../../../server/src/modules/consumables/models/consumableLot.model');
  const { ConsumableInventoryBalanceModel } = await import(
    '../../../../server/src/modules/consumables/models/consumableInventoryBalance.model'
  );

  await connectDatabase();

  const districtOffice = await OfficeModel.create({
    name: 'District Office A',
    type: 'DISTRICT_OFFICE',
  });
  const districtLab = await OfficeModel.create({
    name: 'District Lab A',
    type: 'DISTRICT_LAB',
  });

  const passwordHash = await bcrypt.hash('Passw0rd!', 10);
  const officeCaretaker = await UserModel.create({
    email: 'office-caretaker@example.com',
    password_hash: passwordHash,
    role: 'caretaker',
    first_name: 'Office',
    last_name: 'Caretaker',
    location_id: districtOffice._id,
  });
  const labCaretaker = await UserModel.create({
    email: 'lab-caretaker@example.com',
    password_hash: passwordHash,
    role: 'caretaker',
    first_name: 'Lab',
    last_name: 'Caretaker',
    location_id: districtLab._id,
  });

  await ConsumableUnitModel.create({
    code: 'EA',
    name: 'Each',
    group: 'count',
    to_base: 1,
    aliases: ['each'],
    is_active: true,
  });

  const generalCategory = await CategoryModel.create({
    name: 'General Consumables',
    asset_type: 'CONSUMABLE',
    scope: 'GENERAL',
  });
  const labOnlyCategory = await CategoryModel.create({
    name: 'Lab Consumables',
    asset_type: 'CONSUMABLE',
    scope: 'LAB_ONLY',
  });

  const generalItem = await ConsumableItemModel.create({
    name: 'Office Paper',
    category_id: generalCategory._id,
    base_uom: 'EA',
    requires_lot_tracking: true,
  });
  const labOnlyItem = await ConsumableItemModel.create({
    name: 'Chemical Reagent',
    category_id: labOnlyCategory._id,
    base_uom: 'EA',
    is_chemical: true,
    requires_lot_tracking: true,
    requires_container_tracking: false,
  });

  const now = new Date();
  const plus180Days = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);

  const generalOfficeLot = await ConsumableLotModel.create({
    consumable_id: generalItem._id,
    holder_type: 'OFFICE',
    holder_id: districtOffice._id,
    batch_no: 'GEN-001',
    expiry_date: plus180Days,
    qty_received: 100,
    qty_available: 100,
    received_by_user_id: officeCaretaker._id,
    source_type: 'procurement',
  });

  const labOfficeLot = await ConsumableLotModel.create({
    consumable_id: labOnlyItem._id,
    holder_type: 'OFFICE',
    holder_id: districtOffice._id,
    batch_no: 'LAB-OFF-001',
    expiry_date: plus180Days,
    qty_received: 50,
    qty_available: 50,
    received_by_user_id: officeCaretaker._id,
    source_type: 'procurement',
  });

  const labLot = await ConsumableLotModel.create({
    consumable_id: labOnlyItem._id,
    holder_type: 'OFFICE',
    holder_id: districtLab._id,
    batch_no: 'LAB-001',
    expiry_date: plus180Days,
    qty_received: 75,
    qty_available: 75,
    received_by_user_id: labCaretaker._id,
    source_type: 'procurement',
  });

  await ConsumableInventoryBalanceModel.create([
    {
      holder_type: 'OFFICE',
      holder_id: districtOffice._id,
      consumable_item_id: generalItem._id,
      lot_id: generalOfficeLot._id,
      qty_on_hand_base: 100,
      qty_reserved_base: 0,
    },
    {
      holder_type: 'OFFICE',
      holder_id: districtOffice._id,
      consumable_item_id: labOnlyItem._id,
      lot_id: labOfficeLot._id,
      qty_on_hand_base: 50,
      qty_reserved_base: 0,
    },
    {
      holder_type: 'OFFICE',
      holder_id: districtLab._id,
      consumable_item_id: labOnlyItem._id,
      lot_id: labLot._id,
      qty_on_hand_base: 75,
      qty_reserved_base: 0,
    },
  ]);

  const app = createApp();
  const officeAgent = request.agent(app);
  const labAgent = request.agent(app);
  await login(officeAgent, 'office-caretaker@example.com', 'Passw0rd!');
  await login(labAgent, 'lab-caretaker@example.com', 'Passw0rd!');

  const officeItems = await officeAgent.get('/api/consumables/items?limit=100');
  assert.equal(officeItems.status, 200);
  assert.equal(
    officeItems.body.some((item: any) => String(item._id || item.id) === String(labOnlyItem._id)),
    false,
    'District office should not list LAB_ONLY item'
  );
  assert.equal(
    officeItems.body.some((item: any) => String(item._id || item.id) === String(generalItem._id)),
    true,
    'District office should list GENERAL item'
  );

  const officeLabItemById = await officeAgent.get(`/api/consumables/items/${labOnlyItem.id}`);
  assert.equal(officeLabItemById.status, 403);

  const officeLabLots = await officeAgent.get(`/api/consumables/lots?consumable_id=${labOnlyItem.id}`);
  assert.equal(officeLabLots.status, 403);

  const officeConsumeLabOnly = await officeAgent.post('/api/consumables/inventory/consume').send({
    holderType: 'OFFICE',
    holderId: districtOffice.id,
    itemId: labOnlyItem.id,
    lotId: labOfficeLot.id,
    qty: 1,
    uom: 'EA',
    notes: 'consume check',
  });
  assert.equal(officeConsumeLabOnly.status, 403);

  const labItems = await labAgent.get('/api/consumables/items?limit=100');
  assert.equal(labItems.status, 200);
  assert.equal(
    labItems.body.some((item: any) => String(item._id || item.id) === String(labOnlyItem._id)),
    true,
    'District lab should list LAB_ONLY item'
  );

  const labLots = await labAgent.get(`/api/consumables/lots?consumable_id=${labOnlyItem.id}`);
  assert.equal(labLots.status, 200);
  assert.equal(Array.isArray(labLots.body), true);
  assert.equal(labLots.body.length > 0, true);
  assert.equal(
    labLots.body.every((lot: any) => String(lot.holder_id) === String(districtLab._id)),
    true,
    'District lab should only see lots from its own office'
  );

  const labConsumeLabOnly = await labAgent.post('/api/consumables/inventory/consume').send({
    holderType: 'OFFICE',
    holderId: districtLab.id,
    itemId: labOnlyItem.id,
    lotId: labLot.id,
    qty: 2,
    uom: 'EA',
    notes: 'consume check',
  });
  assert.equal(labConsumeLabOnly.status, 201, `Expected lab consume success, got ${labConsumeLabOnly.status}`);

  await mongoose.disconnect();
  await mongo.stop();
  console.log('Consumables LAB_ONLY access runtime test passed.');
}

main().catch(async (error) => {
  console.error('Consumables LAB_ONLY access runtime test failed.');
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore cleanup errors
  }
  process.exit(1);
});
