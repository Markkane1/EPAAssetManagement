import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

type Agent = ReturnType<typeof request.agent>;

async function login(agent: Agent, email: string, password: string) {
  const res = await agent.post('/api/auth/login').send({ email, password });
  assert.equal(res.status, 200, `Expected login to succeed for ${email}, got ${res.status}`);
}

async function main() {
  const mongo = await MongoMemoryServer.create();
  process.env.NODE_ENV = 'test';
  process.env.MONGO_URI = mongo.getUri();
  process.env.JWT_SECRET = '0123456789abcdef0123456789abcdef';
  process.env.CORS_ORIGIN = 'http://localhost:5173';
  process.env.JWT_EXPIRES_IN = '7d';
  process.env.SEED_SUPER_ADMIN = 'false';

  const { connectDatabase } = await import('../../src/config/db');
  const { createApp } = await import('../../src/app');
  const { UserModel } = await import('../../src/models/user.model');
  const { OfficeModel } = await import('../../src/models/office.model');
  const { ActivityLogModel } = await import('../../src/models/activityLog.model');

  await connectDatabase();

  const officeA = await OfficeModel.create({ name: 'Office A', is_headoffice: false, type: 'LAB' });
  const officeB = await OfficeModel.create({ name: 'Office B', is_headoffice: false, type: 'LAB' });

  const passwordHash = await bcrypt.hash('Passw0rd!', 10);
  const superAdmin = await UserModel.create({
    email: 'super@example.com',
    password_hash: passwordHash,
    role: 'super_admin',
    first_name: 'Super',
    last_name: 'Admin',
  });
  await UserModel.create({
    email: 'admin@example.com',
    password_hash: passwordHash,
    role: 'admin',
    first_name: 'Admin',
    last_name: 'User',
    location_id: officeA.id,
  });
  const userA = await UserModel.create({
    email: 'usera@example.com',
    password_hash: passwordHash,
    role: 'user',
    first_name: 'User',
    last_name: 'A',
    location_id: officeA.id,
  });
  await UserModel.create({
    email: 'userb@example.com',
    password_hash: passwordHash,
    role: 'user',
    first_name: 'User',
    last_name: 'B',
    location_id: officeB.id,
  });

  const app = createApp();
  const adminAgent = request.agent(app);
  const userAgent = request.agent(app);
  const userBAgent = request.agent(app);

  await login(adminAgent, 'admin@example.com', 'Passw0rd!');
  await login(userAgent, 'usera@example.com', 'Passw0rd!');
  await login(userBAgent, 'userb@example.com', 'Passw0rd!');

  // 1) Self-registration + role escalation must be blocked for unauthenticated users.
  const unauthRegister = await request(app).post('/api/auth/register').send({
    email: 'attacker@example.com',
    password: 'Passw0rd!',
    role: 'super_admin',
  });
  assert.equal(unauthRegister.status, 401, 'Unauthenticated registration should be denied');

  // 2) Non-super admin should not be able to create super admins via register.
  const adminEscalation = await adminAgent.post('/api/auth/register').send({
    email: 'bad-escalation@example.com',
    password: 'Passw0rd!',
    role: 'super_admin',
  });
  assert.equal(adminEscalation.status, 403, 'Admin role escalation to super_admin must be denied');

  const adminUnknownRole = await adminAgent.post('/api/auth/register').send({
    email: 'bad-role@example.com',
    password: 'Passw0rd!',
    role: 'not_a_real_role',
  });
  assert.equal(adminUnknownRole.status, 400, 'Unknown roles must be rejected');

  // 3) Previously public write endpoints should now require auth.
  const unauthOfficeCreate = await request(app).post('/api/offices').send({ name: 'Injected Office' });
  assert.equal(unauthOfficeCreate.status, 401, 'Unauthenticated office creation should be denied');

  const unauthVendorCreate = await request(app).post('/api/vendors').send({ name: 'Injected Vendor' });
  assert.equal(unauthVendorCreate.status, 401, 'Unauthenticated vendor creation should be denied');

  // 4) Authenticated non-admin users should not be able to perform admin writes.
  const userVendorCreate = await userAgent.post('/api/vendors').send({ name: 'User Vendor' });
  assert.equal(userVendorCreate.status, 403, 'Non-admin vendor creation should be denied');

  const userSettingsUpdate = await userAgent.put('/api/settings').send({ security: { session_timeout_minutes: 1 } });
  assert.equal(userSettingsUpdate.status, 403, 'Non-admin settings update should be denied');

  // 4b) Operator-style payloads should not execute during updates.
  const adminVendor = await adminAgent.post('/api/vendors').send({ name: 'Safe Vendor' });
  assert.equal(adminVendor.status, 201, 'Admin vendor create should succeed');
  const injectedUpdate = await adminAgent
    .put(`/api/vendors/${adminVendor.body.id}`)
    .send({ $set: { name: 'Injected Name' } });
  assert.equal(injectedUpdate.status, 200, 'Update endpoint should return success on sanitized payload');
  assert.notEqual(
    injectedUpdate.body.name,
    'Injected Name',
    'Mongo operator payload must be sanitized and not applied'
  );

  // 5) Activity log spoofing must be blocked: server should force current user id.
  const spoofAttempt = await userAgent.post('/api/activities').send({
    userId: superAdmin.id,
    activityType: 'page_view',
    description: 'spoofed',
  });
  assert.equal(spoofAttempt.status, 201, 'Authenticated activity create should succeed');
  assert.equal(
    String(spoofAttempt.body.user_id),
    String(userA.id),
    'Activity user_id must be derived from authenticated session, not request body'
  );

  const unauthorizedRead = await userAgent.get(`/api/activities/user/${superAdmin.id}`);
  assert.equal(unauthorizedRead.status, 403, 'Non-admin must not read another user activity stream');

  // 6) Server-side rate limiting should throttle brute-force login attempts.
  let lastStatus = 0;
  for (let i = 0; i < 11; i += 1) {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'usera@example.com', password: 'wrong-password' });
    lastStatus = res.status;
  }
  assert.equal(lastStatus, 429, 'Login brute-force should be rate limited with HTTP 429');

  // 7) Protected document downloads: no direct public static read; office-scoped access enforced.
  const tempPdfPath = path.join(os.tmpdir(), `security-test-${Date.now()}.pdf`);
  fs.writeFileSync(tempPdfPath, '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');

  const createdDoc = await userAgent.post('/api/documents').send({
    title: 'Security Test Doc',
    docType: 'Invoice',
    officeId: officeA.id,
  });
  assert.equal(createdDoc.status, 201, 'Document create should succeed');

  const uploadRes = await userAgent
    .post(`/api/documents/${createdDoc.body.id}/upload`)
    .attach('file', tempPdfPath, { contentType: 'application/pdf', filename: 'test.pdf' });
  assert.equal(uploadRes.status, 201, 'Document upload should succeed');

  const versionId = uploadRes.body.id as string;
  const filePath = uploadRes.body.file_path as string;

  const unauthDownload = await request(app).get(`/api/documents/versions/${versionId}/download`);
  assert.equal(unauthDownload.status, 401, 'Unauthenticated document download must be denied');

  const crossOfficeDownload = await userBAgent.get(`/api/documents/versions/${versionId}/download`);
  assert.equal(crossOfficeDownload.status, 403, 'Cross-office document download must be denied');

  const ownerOfficeDownload = await userAgent.get(`/api/documents/versions/${versionId}/download`);
  assert.equal(ownerOfficeDownload.status, 200, 'Authorized document download should succeed');

  const directStaticRead = await request(app).get(`/${String(filePath).replace(/\\/g, '/')}`);
  assert.equal(directStaticRead.status, 404, 'Direct /uploads static file access should not be exposed');

  fs.unlinkSync(tempPdfPath);
  await ActivityLogModel.deleteMany({});
  await mongoose.disconnect();
  await mongo.stop();

  console.log('Security runtime exploitation tests passed.');
}

main().catch(async (error) => {
  console.error('Security runtime exploitation tests failed.');
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore cleanup errors
  }
  process.exit(1);
});
