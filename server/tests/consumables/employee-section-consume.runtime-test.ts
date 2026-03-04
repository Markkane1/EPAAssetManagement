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

  const { connectDatabase } = await import('../../src/config/db');
  const { createApp } = await import('../../src/app');
  const { OfficeModel } = await import('../../src/models/office.model');
  const { OfficeSubLocationModel } = await import('../../src/models/officeSubLocation.model');
  const { UserModel } = await import('../../src/models/user.model');
  const { EmployeeModel } = await import('../../src/models/employee.model');
  const { CategoryModel } = await import('../../src/models/category.model');
  const { ConsumableUnitModel } = await import('../../src/modules/consumables/models/consumableUnit.model');
  const { ConsumableItemModel } = await import('../../src/modules/consumables/models/consumableItem.model');
  const { ConsumableLotModel } = await import('../../src/modules/consumables/models/consumableLot.model');
  const { ConsumableInventoryBalanceModel } = await import(
    '../../src/modules/consumables/models/consumableInventoryBalance.model'
  );

  await connectDatabase();

  const office = await OfficeModel.create({
    name: 'District Office X',
    type: 'DISTRICT_OFFICE',
  });

  const sectionA = await OfficeSubLocationModel.create({
    office_id: office._id,
    name: 'Room A',
    is_active: true,
  });
  const sectionB = await OfficeSubLocationModel.create({
    office_id: office._id,
    name: 'Room B',
    is_active: true,
  });

  const passwordHash = await bcrypt.hash('Passw0rd!', 10);
  const user = await UserModel.create({
    email: 'employee-section@example.com',
    password_hash: passwordHash,
    role: 'employee',
    first_name: 'Section',
    last_name: 'Employee',
    location_id: office._id,
  });

  const employee = await EmployeeModel.create({
    first_name: 'Section',
    last_name: 'Employee',
    email: 'employee-section@example.com',
    user_id: user._id,
    location_id: office._id,
    default_sub_location_id: sectionA._id,
    allowed_sub_location_ids: [sectionA._id],
    is_active: true,
  });

  await ConsumableUnitModel.create({
    code: 'EA',
    name: 'Each',
    group: 'count',
    to_base: 1,
    aliases: ['each'],
    is_active: true,
  });

  const category = await CategoryModel.create({
    name: 'General Items',
    asset_type: 'CONSUMABLE',
    scope: 'GENERAL',
  });

  const item = await ConsumableItemModel.create({
    name: 'Printer Ink',
    category_id: category._id,
    base_uom: 'EA',
    requires_lot_tracking: true,
  });

  const plus120Days = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000);
  const lot = await ConsumableLotModel.create({
    consumable_id: item._id,
    holder_type: 'OFFICE',
    holder_id: office._id,
    batch_no: 'B-SEC-001',
    expiry_date: plus120Days,
    qty_received: 20,
    qty_available: 20,
    received_by_user_id: user._id,
    source_type: 'procurement',
  });

  await ConsumableInventoryBalanceModel.create([
    {
      holder_type: 'SUB_LOCATION',
      holder_id: sectionA._id,
      consumable_item_id: item._id,
      lot_id: lot._id,
      qty_on_hand_base: 10,
      qty_reserved_base: 0,
    },
    {
      holder_type: 'SUB_LOCATION',
      holder_id: sectionB._id,
      consumable_item_id: item._id,
      lot_id: lot._id,
      qty_on_hand_base: 10,
      qty_reserved_base: 0,
    },
  ]);

  const app = createApp();
  const employeeAgent = request.agent(app);
  await login(employeeAgent, 'employee-section@example.com', 'Passw0rd!');

  const consumeAllowedSection = await employeeAgent.post('/api/consumables/inventory/consume').send({
    holderType: 'SUB_LOCATION',
    holderId: sectionA.id,
    itemId: item.id,
    lotId: lot.id,
    qty: 1,
    uom: 'EA',
    notes: 'Allowed section consume',
  });
  assert.equal(consumeAllowedSection.status, 201, `Expected allowed section consume, got ${consumeAllowedSection.status}`);

  const consumeBlockedSection = await employeeAgent.post('/api/consumables/inventory/consume').send({
    holderType: 'SUB_LOCATION',
    holderId: sectionB.id,
    itemId: item.id,
    lotId: lot.id,
    qty: 1,
    uom: 'EA',
    notes: 'Blocked section consume',
  });
  assert.equal(consumeBlockedSection.status, 403);

  const balancesAll = await employeeAgent.get('/api/consumables/inventory/balances');
  assert.equal(balancesAll.status, 200);
  assert.equal(
    balancesAll.body.some((row: any) => String(row.holder_type) === 'SUB_LOCATION' && String(row.holder_id) === String(sectionA._id)),
    true,
    'Employee should see assigned section balances'
  );
  assert.equal(
    balancesAll.body.some((row: any) => String(row.holder_type) === 'SUB_LOCATION' && String(row.holder_id) === String(sectionB._id)),
    false,
    'Employee should not see unassigned section balances'
  );

  const balancesBlockedSection = await employeeAgent.get(
    `/api/consumables/inventory/balances?holderType=SUB_LOCATION&holderId=${sectionB.id}`
  );
  assert.equal(balancesBlockedSection.status, 403);

  const balancesOffice = await employeeAgent.get(
    `/api/consumables/inventory/balances?holderType=OFFICE&holderId=${office.id}`
  );
  assert.equal(balancesOffice.status, 403);

  const ledgerAll = await employeeAgent.get('/api/consumables/ledger');
  assert.equal(ledgerAll.status, 200);
  assert.equal(
    ledgerAll.body.some(
      (row: any) =>
        String(row.from_holder_type || '') === 'SUB_LOCATION' &&
        String(row.from_holder_id || '') === String(sectionA._id)
    ),
    true,
    'Employee ledger should include assigned section transactions'
  );

  const ledgerBlockedSection = await employeeAgent.get(
    `/api/consumables/ledger?holderType=SUB_LOCATION&holderId=${sectionB.id}`
  );
  assert.equal(ledgerBlockedSection.status, 403);

  const consumeFromOffice = await employeeAgent.post('/api/consumables/inventory/consume').send({
    holderType: 'OFFICE',
    holderId: office.id,
    itemId: item.id,
    lotId: lot.id,
    qty: 1,
    uom: 'EA',
    notes: 'Office consume should be blocked',
  });
  assert.equal(consumeFromOffice.status, 403);

  const consumeOwnHolderWithoutStock = await employeeAgent.post('/api/consumables/inventory/consume').send({
    holderType: 'EMPLOYEE',
    holderId: employee.id,
    itemId: item.id,
    qty: 1,
    uom: 'EA',
    notes: 'Own holder with zero stock',
  });
  assert.equal(consumeOwnHolderWithoutStock.status, 400);

  await mongoose.disconnect();
  await mongo.stop();
  console.log('Employee section consume runtime test passed.');
}

main().catch(async (error) => {
  console.error('Employee section consume runtime test failed.');
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore cleanup errors
  }
  process.exit(1);
});
