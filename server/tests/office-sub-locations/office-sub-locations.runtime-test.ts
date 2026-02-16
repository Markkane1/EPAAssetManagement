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

  await connectDatabase();

  const officeA = await OfficeModel.create({ name: 'Office A', type: 'DISTRICT_OFFICE' });
  const officeB = await OfficeModel.create({ name: 'Office B', type: 'DISTRICT_OFFICE' });

  const passwordHash = await bcrypt.hash('Passw0rd!', 10);
  await UserModel.create({
    email: 'admin-office-sub-loc@example.com',
    password_hash: passwordHash,
    role: 'org_admin',
  });
  await UserModel.create({
    email: 'manager-office-sub-loc@example.com',
    password_hash: passwordHash,
    role: 'office_head',
    location_id: officeA._id,
  });
  await UserModel.create({
    email: 'employee-office-sub-loc@example.com',
    password_hash: passwordHash,
    role: 'employee',
    location_id: officeA._id,
  });

  const app = createApp();
  const adminAgent = request.agent(app);
  const managerAgent = request.agent(app);
  const employeeAgent = request.agent(app);

  await login(adminAgent, 'admin-office-sub-loc@example.com', 'Passw0rd!');
  await login(managerAgent, 'manager-office-sub-loc@example.com', 'Passw0rd!');
  await login(employeeAgent, 'employee-office-sub-loc@example.com', 'Passw0rd!');

  const createRoom = await managerAgent.post('/api/office-sub-locations').send({ name: 'Room 101' });
  assert.equal(createRoom.status, 201, `Room create failed: ${createRoom.status} ${JSON.stringify(createRoom.body)}`);
  assert.equal(String(createRoom.body.office_id), String(officeA._id));
  assert.equal(createRoom.body.name, 'Room 101');
  const roomId = String(createRoom.body.id || createRoom.body._id);

  const listRooms = await managerAgent.get('/api/office-sub-locations');
  assert.equal(listRooms.status, 200);
  assert.equal(listRooms.body.length, 1);
  assert.equal(String(listRooms.body[0].id || listRooms.body[0]._id), roomId);
  assert.equal(listRooms.body[0].is_active, true);

  const crossOfficeList = await managerAgent
    .get('/api/office-sub-locations')
    .query({ officeId: String(officeB._id) });
  assert.equal(crossOfficeList.status, 403);

  const adminCreateOtherOffice = await adminAgent.post('/api/office-sub-locations').send({
    office_id: String(officeB._id),
    name: 'Lab Room',
  });
  assert.equal(adminCreateOtherOffice.status, 201);
  assert.equal(String(adminCreateOtherOffice.body.office_id), String(officeB._id));

  const deactivateRoom = await managerAgent
    .put(`/api/office-sub-locations/${roomId}`)
    .send({ is_active: false });
  assert.equal(deactivateRoom.status, 200);
  assert.equal(deactivateRoom.body.is_active, false);

  const listAfterDeactivate = await managerAgent.get('/api/office-sub-locations');
  assert.equal(listAfterDeactivate.status, 200);
  assert.equal(listAfterDeactivate.body.length, 0);

  const listIncludingInactive = await managerAgent
    .get('/api/office-sub-locations')
    .query({ includeInactive: true });
  assert.equal(listIncludingInactive.status, 200);
  assert.equal(listIncludingInactive.body.length, 1);
  assert.equal(listIncludingInactive.body[0].is_active, false);

  const employeeCreateDenied = await employeeAgent.post('/api/office-sub-locations').send({ name: 'Denied Room' });
  assert.equal(employeeCreateDenied.status, 403);

  await mongoose.disconnect();
  await mongo.stop();
  console.log('Office sub-locations runtime test passed.');
}

main().catch(async (error) => {
  console.error('Office sub-locations runtime test failed.');
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore cleanup errors
  }
  process.exit(1);
});

