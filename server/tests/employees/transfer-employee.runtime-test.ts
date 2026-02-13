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
  const { AuditLogModel } = await import('../../src/models/auditLog.model');

  await connectDatabase();

  const officeA = await OfficeModel.create({ name: 'Transfer Office A', type: 'LAB', is_headoffice: false });
  const officeB = await OfficeModel.create({ name: 'Transfer Office B', type: 'LAB', is_headoffice: false });
  const officeC = await OfficeModel.create({ name: 'Transfer Office C', type: 'LAB', is_headoffice: false });

  const passwordHash = await bcrypt.hash('Passw0rd!', 10);
  await UserModel.create({
    email: 'transfer-super@example.com',
    password_hash: passwordHash,
    role: 'super_admin',
    first_name: 'Super',
    last_name: 'Admin',
  });
  await UserModel.create({
    email: 'transfer-admin@example.com',
    password_hash: passwordHash,
    role: 'admin',
    first_name: 'Normal',
    last_name: 'Admin',
    location_id: officeA._id,
  });
  await UserModel.create({
    email: 'transfer-location-admin@example.com',
    password_hash: passwordHash,
    role: 'location_admin',
    first_name: 'Location',
    last_name: 'Admin',
    location_id: officeA._id,
  });
  const employeeUser = await UserModel.create({
    email: 'transfer-employee-user@example.com',
    password_hash: passwordHash,
    role: 'employee',
    first_name: 'Linked',
    last_name: 'User',
    location_id: officeA._id,
  });
  const employee = await EmployeeModel.create({
    first_name: 'Transfer',
    last_name: 'Target',
    email: 'transfer.target@example.com',
    user_id: employeeUser._id,
    location_id: officeA._id,
    is_active: true,
  });

  const app = createApp();
  const superAgent = request.agent(app);
  const adminAgent = request.agent(app);
  const locationAdminAgent = request.agent(app);
  await login(superAgent, 'transfer-super@example.com', 'Passw0rd!');
  await login(adminAgent, 'transfer-admin@example.com', 'Passw0rd!');
  await login(locationAdminAgent, 'transfer-location-admin@example.com', 'Passw0rd!');

  const firstTransfer = await superAgent.post(`/api/employees/${employee.id}/transfer`).send({
    newOfficeId: String(officeB._id),
    reason: 'Operational reassignment',
  });
  assert.equal(
    firstTransfer.status,
    200,
    `Super admin transfer failed: ${firstTransfer.status} ${JSON.stringify(firstTransfer.body)}`
  );
  assert.equal(String(firstTransfer.body.location_id), String(officeB._id));
  assert.equal(String(firstTransfer.body.transferred_from_office_id), String(officeA._id));
  assert.equal(String(firstTransfer.body.transferred_to_office_id), String(officeB._id));
  assert.equal(String(firstTransfer.body.transfer_reason), 'Operational reassignment');
  assert.ok(firstTransfer.body.transferred_at);

  const linkedUserAfterFirstTransfer = await UserModel.findById(employeeUser._id).lean();
  assert.equal(String(linkedUserAfterFirstTransfer?.location_id), String(officeB._id));

  const secondTransfer = await adminAgent.post(`/api/employees/${employee.id}/transfer`).send({
    newOfficeId: String(officeC._id),
    reason: 'Admin rotation',
  });
  assert.equal(
    secondTransfer.status,
    200,
    `Admin transfer failed: ${secondTransfer.status} ${JSON.stringify(secondTransfer.body)}`
  );
  assert.equal(String(secondTransfer.body.location_id), String(officeC._id));
  assert.equal(String(secondTransfer.body.transferred_from_office_id), String(officeB._id));
  assert.equal(String(secondTransfer.body.transferred_to_office_id), String(officeC._id));
  assert.equal(String(secondTransfer.body.transfer_reason), 'Admin rotation');

  const linkedUserAfterSecondTransfer = await UserModel.findById(employeeUser._id).lean();
  assert.equal(String(linkedUserAfterSecondTransfer?.location_id), String(officeC._id));

  const blockedTransfer = await locationAdminAgent.post(`/api/employees/${employee.id}/transfer`).send({
    newOfficeId: String(officeA._id),
    reason: 'Location admin should be blocked',
  });
  assert.equal(blockedTransfer.status, 403);

  const audits = await AuditLogModel.find({
    action: 'EMPLOYEE_TRANSFER',
    entity_type: 'Employee',
    entity_id: employee._id,
  })
    .sort({ created_at: 1 })
    .lean();
  assert.equal(audits.length, 2);
  assert.equal(String((audits[0]?.diff as { transferred_to_office_id?: unknown })?.transferred_to_office_id || ''), String(officeB._id));
  assert.equal(String((audits[1]?.diff as { transferred_to_office_id?: unknown })?.transferred_to_office_id || ''), String(officeC._id));

  await mongoose.disconnect();
  await mongo.stop();
  console.log('Employee transfer runtime test passed.');
}

main().catch(async (error) => {
  console.error('Employee transfer runtime test failed.');
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore cleanup errors
  }
  process.exit(1);
});
