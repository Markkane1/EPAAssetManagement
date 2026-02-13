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
  const { UserModel } = await import('../../src/models/user.model');
  const { EmployeeModel } = await import('../../src/models/employee.model');
  const { AssetModel } = await import('../../src/models/asset.model');
  const { AssetItemModel } = await import('../../src/models/assetItem.model');
  const { AssignmentModel } = await import('../../src/models/assignment.model');
  const { ReturnRequestModel } = await import('../../src/models/returnRequest.model');

  await connectDatabase();

  const office = await OfficeModel.create({
    name: 'Return Request Lab',
    type: 'LAB',
    is_headoffice: false,
  });

  const passwordHash = await bcrypt.hash('Passw0rd!', 10);
  const user = await UserModel.create({
    email: 'return-user@example.com',
    password_hash: passwordHash,
    role: 'user',
    first_name: 'Return',
    last_name: 'User',
    location_id: office._id,
  });

  const employee = await EmployeeModel.create({
    first_name: 'Emp',
    last_name: 'One',
    email: 'emp.one@example.com',
    user_id: user._id,
    location_id: office._id,
    is_active: true,
  });

  const asset = await AssetModel.create({
    name: 'Laptop Model X',
    quantity: 2,
    is_active: true,
  });

  const itemA = await AssetItemModel.create({
    asset_id: asset._id,
    location_id: office._id,
    assignment_status: 'Assigned',
    item_status: 'Assigned',
    is_active: true,
  });
  const itemB = await AssetItemModel.create({
    asset_id: asset._id,
    location_id: office._id,
    assignment_status: 'Assigned',
    item_status: 'Assigned',
    is_active: true,
  });

  await AssignmentModel.create({
    asset_item_id: itemA._id,
    employee_id: employee._id,
    assigned_date: new Date(),
    is_active: true,
  });
  await AssignmentModel.create({
    asset_item_id: itemB._id,
    employee_id: employee._id,
    assigned_date: new Date(),
    is_active: true,
  });

  const app = createApp();
  const agent = request.agent(app);
  await login(agent, 'return-user@example.com', 'Passw0rd!');

  const returnAllRes = await agent.post('/api/return-requests').send({
    returnAll: true,
  });
  assert.equal(
    returnAllRes.status,
    201,
    `returnAll request failed: ${returnAllRes.status} ${JSON.stringify(returnAllRes.body)}`
  );
  assert.equal(returnAllRes.body.status, 'SUBMITTED');
  assert.equal(returnAllRes.body.employee_id, String(employee._id));
  assert.equal(returnAllRes.body.office_id, String(office._id));
  assert.equal(returnAllRes.body.lines.length, 2);

  const specificRes = await agent.post('/api/return-requests').send({
    assetItemIds: [String(itemA._id)],
  });
  assert.equal(
    specificRes.status,
    201,
    `specific asset request failed: ${specificRes.status} ${JSON.stringify(specificRes.body)}`
  );
  assert.equal(specificRes.body.status, 'SUBMITTED');
  assert.equal(specificRes.body.lines.length, 1);
  assert.equal(String(specificRes.body.lines[0].asset_item_id), String(itemA._id));

  const bothModesRes = await agent.post('/api/return-requests').send({
    returnAll: true,
    assetItemIds: [String(itemA._id)],
  });
  assert.equal(bothModesRes.status, 400);

  const stored = await ReturnRequestModel.find().lean();
  assert.equal(stored.length, 2);

  await mongoose.disconnect();
  await mongo.stop();
  console.log('Return request runtime test passed.');
}

main().catch(async (error) => {
  console.error('Return request runtime test failed.');
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore cleanup errors
  }
  process.exit(1);
});
