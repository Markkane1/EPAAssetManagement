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
  const { AssetModel } = await import('../../src/models/asset.model');
  const { AssetItemModel } = await import('../../src/models/assetItem.model');

  await connectDatabase();

  const hq = await OfficeModel.create({
    name: 'HQ',
    type: 'CENTRAL',
    is_headoffice: true,
  });
  const officeA = await OfficeModel.create({
    name: 'Office A',
    type: 'LAB',
    is_headoffice: false,
  });
  const officeB = await OfficeModel.create({
    name: 'Office B',
    type: 'LAB',
    is_headoffice: false,
  });

  const passwordHash = await bcrypt.hash('Passw0rd!', 10);
  await UserModel.create({
    email: 'super-admin@example.com',
    password_hash: passwordHash,
    role: 'super_admin',
    first_name: 'Super',
    last_name: 'Admin',
  });
  await UserModel.create({
    email: 'manager@example.com',
    password_hash: passwordHash,
    role: 'location_admin',
    first_name: 'Office',
    last_name: 'Manager',
    location_id: officeA._id,
  });

  const assetA = await AssetModel.create({
    name: 'Asset A',
    quantity: 5,
    is_active: true,
  });
  const assetB = await AssetModel.create({
    name: 'Asset B',
    quantity: 5,
    is_active: true,
  });

  const item = await AssetItemModel.create({
    asset_id: assetA._id,
    location_id: officeA._id,
    assignment_status: 'Unassigned',
    item_status: 'Available',
    item_condition: 'Good',
    is_active: true,
  });

  const app = createApp();
  const managerAgent = request.agent(app);
  const superAgent = request.agent(app);
  await login(managerAgent, 'manager@example.com', 'Passw0rd!');
  await login(superAgent, 'super-admin@example.com', 'Passw0rd!');

  const allowedUpdate = await managerAgent.put(`/api/asset-items/${item.id}`).send({
    itemStatus: 'Maintenance',
    condition: 'Poor',
    notes: 'Needs service',
  });
  assert.equal(allowedUpdate.status, 200, `Allowed manager update failed: ${allowedUpdate.status}`);
  assert.equal(allowedUpdate.body.item_status, 'Maintenance');
  assert.equal(allowedUpdate.body.item_condition, 'Poor');
  assert.equal(allowedUpdate.body.notes, 'Needs service');

  const forbiddenAssetId = await managerAgent.put(`/api/asset-items/${item.id}`).send({
    assetId: String(assetB._id),
  });
  assert.equal(forbiddenAssetId.status, 403);

  const forbiddenLocationId = await managerAgent.put(`/api/asset-items/${item.id}`).send({
    locationId: String(officeB._id),
  });
  assert.equal(forbiddenLocationId.status, 403);

  const forbiddenIsActive = await managerAgent.put(`/api/asset-items/${item.id}`).send({
    isActive: false,
  });
  assert.equal(forbiddenIsActive.status, 403);

  const forbiddenProcurement = await managerAgent.put(`/api/asset-items/${item.id}`).send({
    purchaseDate: '2025-01-01',
    warrantyExpiry: '2026-01-01',
    itemSource: 'Transferred',
  });
  assert.equal(forbiddenProcurement.status, 403);

  const managerCreate = await managerAgent.post('/api/asset-items').send({
    assetId: String(assetA._id),
    locationId: String(officeA._id),
  });
  assert.equal(managerCreate.status, 403);

  const managerRetire = await managerAgent.delete(`/api/asset-items/${item.id}`).send();
  assert.equal(managerRetire.status, 403);

  const superCreate = await superAgent.post('/api/asset-items').send({
    assetId: String(assetA._id),
    locationId: String(hq._id),
    notes: 'Created by HQ admin',
  });
  assert.equal(superCreate.status, 201, `HQ create failed: ${superCreate.status}`);

  const superRetire = await superAgent.delete(`/api/asset-items/${item.id}`).send();
  assert.equal(superRetire.status, 204, `HQ retire failed: ${superRetire.status}`);

  const retired = await AssetItemModel.findById(item._id).lean();
  assert.equal(Boolean(retired?.is_active), false);
  assert.equal(String(retired?.item_status), 'Retired');
  assert.equal(String(retired?.assignment_status), 'Unassigned');

  await mongoose.disconnect();
  await mongo.stop();
  console.log('Asset item permission runtime test passed.');
}

main().catch(async (error) => {
  console.error('Asset item permission runtime test failed.');
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore cleanup errors
  }
  process.exit(1);
});
