import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

type Agent = ReturnType<typeof request.agent>;

interface LoginSession {
  authToken: string;
  csrfToken: string;
}

function readCookieValue(setCookie: string[] | undefined, cookieName: string) {
  for (const entry of setCookie || []) {
    const [pair] = entry.split(';');
    if (!pair) continue;
    const separator = pair.indexOf('=');
    if (separator < 0) continue;
    const name = pair.slice(0, separator).trim();
    if (name !== cookieName) continue;
    return decodeURIComponent(pair.slice(separator + 1));
  }
  return null;
}

async function login(agent: Agent, email: string, password: string): Promise<LoginSession> {
  const res = await agent.post('/api/auth/login').send({ email, password });
  assert.equal(res.status, 200, `Expected login to succeed for ${email}, got ${res.status}`);
  const authToken = readCookieValue(res.headers['set-cookie'], 'auth_token');
  const csrfToken = readCookieValue(res.headers['set-cookie'], 'csrf_token');
  assert.ok(authToken, 'Login must return auth token cookie');
  assert.ok(csrfToken, 'Login must return CSRF token cookie');
  return { authToken: authToken as string, csrfToken: csrfToken as string };
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
  const { AssetModel } = await import('../../src/models/asset.model');
  const { AssetItemModel } = await import('../../src/models/assetItem.model');
  const { AssignmentModel } = await import('../../src/models/assignment.model');
  const { MaintenanceRecordModel } = await import('../../src/models/maintenanceRecord.model');

  await connectDatabase();

  const officeA = await OfficeModel.create({ name: 'Office A', type: 'DISTRICT_OFFICE', is_active: true });
  const officeB = await OfficeModel.create({ name: 'Office B', type: 'DISTRICT_OFFICE', is_active: true });

  const passwordHash = await bcrypt.hash('Passw0rd!', 10);
  const orgAdmin = await UserModel.create({
    email: 'org-admin@example.com',
    password_hash: passwordHash,
    role: 'org_admin',
    first_name: 'Org',
    last_name: 'Admin',
  });

  await UserModel.create({
    email: 'office-head-a@example.com',
    password_hash: passwordHash,
    role: 'office_head',
    first_name: 'Office',
    last_name: 'HeadA',
    location_id: officeA.id,
  });

  await UserModel.create({
    email: 'office-head-b@example.com',
    password_hash: passwordHash,
    role: 'office_head',
    first_name: 'Office',
    last_name: 'HeadB',
    location_id: officeB.id,
  });

  const employeeA = await UserModel.create({
    email: 'employee-a@example.com',
    password_hash: passwordHash,
    role: 'employee',
    first_name: 'Employee',
    last_name: 'A',
    location_id: officeA.id,
  });

  await UserModel.create({
    email: 'employee-b@example.com',
    password_hash: passwordHash,
    role: 'employee',
    first_name: 'Employee',
    last_name: 'B',
    location_id: officeB.id,
  });

  const app = createApp();
  const orgAdminAgent = request.agent(app);
  const officeHeadAAgent = request.agent(app);
  const officeHeadBAgent = request.agent(app);
  const employeeAAgent = request.agent(app);
  const employeeBAgent = request.agent(app);

  const orgAdminSession = await login(orgAdminAgent, 'org-admin@example.com', 'Passw0rd!');
  const officeHeadASession = await login(officeHeadAAgent, 'office-head-a@example.com', 'Passw0rd!');
  const officeHeadBSession = await login(officeHeadBAgent, 'office-head-b@example.com', 'Passw0rd!');
  await login(employeeAAgent, 'employee-a@example.com', 'Passw0rd!');
  await login(employeeBAgent, 'employee-b@example.com', 'Passw0rd!');

  const metricsForbidden = await employeeAAgent.get('/api/observability/metrics');
  assert.equal(metricsForbidden.status, 403, 'Only org_admin should access observability metrics');

  const metricsAllowed = await orgAdminAgent.get('/api/observability/metrics');
  assert.equal(metricsAllowed.status, 200, 'Org admin should be able to access observability metrics');
  assert.ok(metricsAllowed.body.generated_at, 'Metrics endpoint should include generated_at timestamp');

  // 1) Self-registration + role escalation must be blocked for unauthenticated users.
  const unauthRegister = await request(app).post('/api/auth/register').send({
    email: 'attacker@example.com',
    password: 'Passw0rd!',
    role: 'org_admin',
  });
  assert.equal(unauthRegister.status, 401, 'Unauthenticated registration should be denied');

  // 2) Non-org admin should not be able to create org admins via register.
  const officeHeadEscalation = await officeHeadAAgent
    .post('/api/auth/register')
    .set('x-csrf-token', officeHeadASession.csrfToken)
    .send({
      email: 'bad-escalation@example.com',
      password: 'Passw0rd!',
      role: 'org_admin',
    });
  assert.equal(officeHeadEscalation.status, 403, 'Office head role escalation to org_admin must be denied');

  const orgAdminUnknownRole = await orgAdminAgent
    .post('/api/auth/register')
    .set('x-csrf-token', orgAdminSession.csrfToken)
    .send({
      email: 'bad-role@example.com',
      password: 'Passw0rd!',
      role: 'not_a_real_role',
    });
  assert.equal(orgAdminUnknownRole.status, 400, 'Unknown roles must be rejected');

  // 3) Previously public write endpoints should require auth.
  const unauthOfficeCreate = await request(app).post('/api/offices').send({ name: 'Injected Office' });
  assert.equal(unauthOfficeCreate.status, 401, 'Unauthenticated office creation should be denied');

  const unauthVendorCreate = await request(app).post('/api/vendors').send({ name: 'Injected Vendor' });
  assert.equal(unauthVendorCreate.status, 401, 'Unauthenticated vendor creation should be denied');

  // 4) Authenticated non-admin users should not be able to perform admin writes.
  const employeeVendorCreate = await employeeAAgent.post('/api/vendors').send({ name: 'Employee Vendor' });
  assert.equal(employeeVendorCreate.status, 403, 'Non-admin vendor creation should be denied');

  const employeeSettingsUpdate = await employeeAAgent.put('/api/settings').send({
    security: { session_timeout_minutes: 1 },
  });
  assert.equal(employeeSettingsUpdate.status, 403, 'Non-admin settings update should be denied');

  // 5) Operator-style payloads should not execute during updates.
  const adminVendor = await orgAdminAgent.post('/api/vendors').send({ name: 'Safe Vendor' });
  assert.equal(adminVendor.status, 201, 'Org admin vendor create should succeed');
  const injectedUpdate = await orgAdminAgent
    .put(`/api/vendors/${adminVendor.body.id}`)
    .send({ $set: { name: 'Injected Name' } });
  assert.equal(injectedUpdate.status, 200, 'Update endpoint should return success on sanitized payload');
  assert.notEqual(
    injectedUpdate.body.name,
    'Injected Name',
    'Mongo operator payload must be sanitized and not applied'
  );

  // 6) Activity log spoofing must be blocked: server should force current user id.
  const spoofAttempt = await employeeAAgent.post('/api/activities').send({
    userId: orgAdmin.id,
    activityType: 'page_view',
    description: 'spoofed',
  });
  assert.equal(spoofAttempt.status, 201, 'Authenticated activity create should succeed');
  assert.equal(
    String(spoofAttempt.body.user_id),
    String(employeeA.id),
    'Activity user_id must be derived from authenticated session, not request body'
  );

  const unauthorizedRead = await employeeAAgent.get(`/api/activities/user/${orgAdmin.id}`);
  assert.equal(unauthorizedRead.status, 403, 'Non-admin must not read another user activity stream');

  // 7) CSRF enforcement must protect cookie-authenticated mutation routes.
  const missingCsrfChangePassword = await employeeAAgent.post('/api/auth/change-password').send({
    oldPassword: 'Passw0rd!',
    newPassword: 'StrongPass!2026A',
  });
  assert.equal(
    missingCsrfChangePassword.status,
    403,
    'Change password without CSRF header must be denied'
  );

  const badCsrfRegister = await officeHeadBAgent
    .post('/api/auth/register')
    .set('x-csrf-token', `${officeHeadBSession.csrfToken}-bad`)
    .send({
      email: 'bad-csrf@example.com',
      password: 'Passw0rd!',
      role: 'employee',
    });
  assert.equal(badCsrfRegister.status, 403, 'Invalid CSRF token must be rejected');

  // 8) Protected document downloads: no direct public static read; office-scoped access enforced.
  const tempPdfPath = path.join(os.tmpdir(), `security-test-${Date.now()}.pdf`);
  const spoofedPdfPath = path.join(os.tmpdir(), `security-spoofed-${Date.now()}.pdf`);
  fs.writeFileSync(tempPdfPath, '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
  fs.writeFileSync(spoofedPdfPath, 'not-a-real-pdf');

  const createdDoc = await employeeAAgent.post('/api/documents').send({
    title: 'Security Test Doc',
    docType: 'Invoice',
    officeId: officeA.id,
  });
  assert.equal(createdDoc.status, 201, 'Document create should succeed');

  const uploadRes = await employeeAAgent
    .post(`/api/documents/${createdDoc.body.id}/upload`)
    .attach('file', tempPdfPath, { contentType: 'application/pdf', filename: 'test.pdf' });
  assert.equal(uploadRes.status, 201, 'Document upload should succeed');

  const spoofedUploadRes = await employeeAAgent
    .post(`/api/documents/${createdDoc.body.id}/upload`)
    .attach('file', spoofedPdfPath, { contentType: 'application/pdf', filename: 'spoofed.pdf' });
  assert.equal(spoofedUploadRes.status, 400, 'Spoofed PDF upload must be rejected');

  const versionId = uploadRes.body.id as string;
  const filePath = uploadRes.body.file_path as string;

  const unauthDownload = await request(app).get(`/api/documents/versions/${versionId}/download`);
  assert.equal(unauthDownload.status, 401, 'Unauthenticated document download must be denied');

  const crossOfficeDownload = await employeeBAgent.get(`/api/documents/versions/${versionId}/download`);
  assert.equal(crossOfficeDownload.status, 403, 'Cross-office document download must be denied');

  const ownerOfficeDownload = await employeeAAgent.get(`/api/documents/versions/${versionId}/download`);
  assert.equal(ownerOfficeDownload.status, 200, 'Authorized document download should succeed');

  const directStaticRead = await request(app).get(`/${String(filePath).replace(/\\/g, '/')}`);
  assert.equal(directStaticRead.status, 404, 'Direct /uploads static file access should not be exposed');

  // 9) Cross-office update/delete must be denied for assignment and maintenance mutations.
  const asset = await AssetModel.create({ name: 'Security Scope Asset', quantity: 1 });
  const assetItemA = await AssetItemModel.create({
    asset_id: asset.id,
    holder_type: 'OFFICE',
    holder_id: officeA.id,
    assignment_status: 'Unassigned',
    item_status: 'Available',
  });

  const assignment = await AssignmentModel.create({
    asset_item_id: assetItemA.id,
    status: 'DRAFT',
    assigned_to_type: 'SUB_LOCATION',
    assigned_to_id: new mongoose.Types.ObjectId(),
    requisition_id: new mongoose.Types.ObjectId(),
    requisition_line_id: new mongoose.Types.ObjectId(),
    assigned_date: new Date(),
    is_active: true,
  });

  const maintenance = await MaintenanceRecordModel.create({
    asset_item_id: assetItemA.id,
    maintenance_type: 'Preventive',
    maintenance_status: 'Scheduled',
    description: 'Scope test',
  });

  const crossOfficeAssignmentUpdate = await officeHeadBAgent
    .put(`/api/assignments/${assignment.id}`)
    .send({ notes: 'cross-office update attempt' });
  assert.equal(crossOfficeAssignmentUpdate.status, 403, 'Cross-office assignment update must be denied');

  const crossOfficeAssignmentDelete = await officeHeadBAgent.delete(`/api/assignments/${assignment.id}`);
  assert.equal(crossOfficeAssignmentDelete.status, 403, 'Cross-office assignment delete must be denied');

  const sameOfficeAssignmentUpdate = await officeHeadAAgent
    .put(`/api/assignments/${assignment.id}`)
    .send({ notes: 'same-office update' });
  assert.equal(sameOfficeAssignmentUpdate.status, 200, 'Same-office assignment update should succeed');

  const sameOfficeAssignmentDelete = await officeHeadAAgent.delete(`/api/assignments/${assignment.id}`);
  assert.equal(sameOfficeAssignmentDelete.status, 204, 'Same-office assignment delete should succeed');

  const crossOfficeMaintenanceUpdate = await officeHeadBAgent
    .put(`/api/maintenance/${maintenance.id}`)
    .send({ notes: 'cross-office update attempt' });
  assert.equal(crossOfficeMaintenanceUpdate.status, 403, 'Cross-office maintenance update must be denied');

  const crossOfficeMaintenanceDelete = await officeHeadBAgent.delete(`/api/maintenance/${maintenance.id}`);
  assert.equal(crossOfficeMaintenanceDelete.status, 403, 'Cross-office maintenance delete must be denied');

  const sameOfficeMaintenanceUpdate = await officeHeadAAgent
    .put(`/api/maintenance/${maintenance.id}`)
    .send({ notes: 'same-office update' });
  assert.equal(sameOfficeMaintenanceUpdate.status, 200, 'Same-office maintenance update should succeed');

  const sameOfficeMaintenanceDelete = await officeHeadAAgent.delete(`/api/maintenance/${maintenance.id}`);
  assert.equal(sameOfficeMaintenanceDelete.status, 204, 'Same-office maintenance delete should succeed');

  // 10) Password reset token flow must be one-time and invalidate old credentials.
  const resetRequest = await request(app).post('/api/auth/forgot-password').send({ email: 'employee-a@example.com' });
  assert.equal(resetRequest.status, 200, 'Forgot password should always return request accepted');
  assert.ok(resetRequest.body.resetToken, 'Test environment should expose reset token for runtime verification');

  const weakReset = await request(app).post('/api/auth/reset-password').send({
    token: resetRequest.body.resetToken,
    newPassword: 'weak',
  });
  assert.equal(weakReset.status, 400, 'Weak reset passwords must be rejected');

  const resetPasswordValue = 'ResetPass!2026A';
  const resetSuccess = await request(app).post('/api/auth/reset-password').send({
    token: resetRequest.body.resetToken,
    newPassword: resetPasswordValue,
  });
  assert.equal(resetSuccess.status, 200, 'Valid reset token should allow password reset');

  const resetReuse = await request(app).post('/api/auth/reset-password').send({
    token: resetRequest.body.resetToken,
    newPassword: 'AnotherReset!2026A',
  });
  assert.equal(resetReuse.status, 400, 'Reset token must be one-time use');

  const oldPasswordLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'employee-a@example.com', password: 'Passw0rd!' });
  assert.equal(oldPasswordLogin.status, 401, 'Old password must be invalid after reset');

  const newPasswordLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'employee-a@example.com', password: resetPasswordValue });
  assert.equal(newPasswordLogin.status, 200, 'New password should authenticate after reset');

  // 11) Password change should invalidate prior session tokens via token version bump.
  const employeeBSessionBeforeChange = await login(employeeBAgent, 'employee-b@example.com', 'Passw0rd!');
  const employeeBNewPassword = 'EmployeeB!2026Reset';
  const changePassword = await employeeBAgent
    .post('/api/auth/change-password')
    .set('x-csrf-token', employeeBSessionBeforeChange.csrfToken)
    .send({
      oldPassword: 'Passw0rd!',
      newPassword: employeeBNewPassword,
    });
  assert.equal(changePassword.status, 200, 'Password change should succeed with valid CSRF token');

  const oldTokenMe = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${employeeBSessionBeforeChange.authToken}`);
  assert.equal(oldTokenMe.status, 401, 'Old JWT token must be invalid after password change');

  const employeeBRelogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'employee-b@example.com', password: employeeBNewPassword });
  assert.equal(employeeBRelogin.status, 200, 'Updated password should authenticate');

  const logoutWithoutCsrf = await employeeBAgent.post('/api/auth/logout');
  assert.equal(logoutWithoutCsrf.status, 403, 'Logout without CSRF token must be denied');

  const latestCsrf =
    readCookieValue(changePassword.headers['set-cookie'], 'csrf_token') || employeeBSessionBeforeChange.csrfToken;
  const logoutWithCsrf = await employeeBAgent.post('/api/auth/logout').set('x-csrf-token', latestCsrf);
  assert.equal(logoutWithCsrf.status, 204, 'Logout with CSRF token should succeed');

  // 12) Server-side rate limiting should throttle brute-force login attempts.
  let lastStatus = 0;
  for (let i = 0; i < 11; i += 1) {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'employee-a@example.com', password: 'wrong-password' });
    lastStatus = res.status;
  }
  assert.equal(lastStatus, 429, 'Login brute-force should be rate limited with HTTP 429');
  const lockoutValidAttempt = await request(app)
    .post('/api/auth/login')
    .send({ email: 'employee-a@example.com', password: resetPasswordValue });
  assert.equal(lockoutValidAttempt.status, 429, 'Locked account should reject valid password during lockout');

  fs.unlinkSync(tempPdfPath);
  fs.unlinkSync(spoofedPdfPath);
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
