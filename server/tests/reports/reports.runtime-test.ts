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
  const { RequisitionModel } = await import('../../src/models/requisition.model');
  const { ReturnRequestModel } = await import('../../src/models/returnRequest.model');
  const { DocumentModel } = await import('../../src/models/document.model');

  await connectDatabase();

  const officeA = await OfficeModel.create({ name: 'Office A', type: 'LAB', is_headoffice: false });
  const officeB = await OfficeModel.create({ name: 'Office B', type: 'LAB', is_headoffice: false });

  const passwordHash = await bcrypt.hash('Passw0rd!', 10);
  const superAdmin = await UserModel.create({
    email: 'reports-super@example.com',
    password_hash: passwordHash,
    role: 'super_admin',
    first_name: 'Reports',
    last_name: 'Super',
  });
  const managerA = await UserModel.create({
    email: 'reports-manager-a@example.com',
    password_hash: passwordHash,
    role: 'location_admin',
    first_name: 'Reports',
    last_name: 'ManagerA',
    location_id: officeA._id,
  });

  const issueSlipA = await DocumentModel.create({
    title: 'Issue Slip A',
    doc_type: 'IssueSlip',
    status: 'Final',
    office_id: officeA._id,
    created_by_user_id: superAdmin._id,
  });

  await RequisitionModel.create({
    file_number: `REQ-A-NONCOMPLIANT-${Date.now()}`,
    office_id: officeA._id,
    issuing_office_id: officeA._id,
    submitted_by_user_id: managerA._id,
    status: 'FULFILLED_PENDING_SIGNATURE',
  });
  await RequisitionModel.create({
    file_number: `REQ-A-COMPLIANT-${Date.now()}`,
    office_id: officeA._id,
    issuing_office_id: officeA._id,
    submitted_by_user_id: managerA._id,
    status: 'FULFILLED',
    signed_issuance_document_id: issueSlipA._id,
    signed_issuance_uploaded_at: new Date(),
  });
  await RequisitionModel.create({
    file_number: `REQ-B-NONCOMPLIANT-${Date.now()}`,
    office_id: officeB._id,
    issuing_office_id: officeB._id,
    submitted_by_user_id: superAdmin._id,
    status: 'FULFILLED_PENDING_SIGNATURE',
  });

  const asset = await AssetModel.create({ name: 'Asset for returns', quantity: 2, is_active: true });
  const itemA = await AssetItemModel.create({
    asset_id: asset._id,
    location_id: officeA._id,
    assignment_status: 'Unassigned',
    item_status: 'Available',
    is_active: true,
  });
  const itemB = await AssetItemModel.create({
    asset_id: asset._id,
    location_id: officeB._id,
    assignment_status: 'Unassigned',
    item_status: 'Available',
    is_active: true,
  });

  const returnSlipA = await DocumentModel.create({
    title: 'Return Slip A',
    doc_type: 'ReturnSlip',
    status: 'Final',
    office_id: officeA._id,
    created_by_user_id: superAdmin._id,
  });

  await ReturnRequestModel.create({
    employee_id: new mongoose.Types.ObjectId(),
    office_id: officeA._id,
    status: 'CLOSED_PENDING_SIGNATURE',
    lines: [{ asset_item_id: itemA._id }],
  });
  await ReturnRequestModel.create({
    employee_id: new mongoose.Types.ObjectId(),
    office_id: officeA._id,
    status: 'CLOSED',
    receipt_document_id: returnSlipA._id,
    lines: [{ asset_item_id: itemA._id }],
  });
  await ReturnRequestModel.create({
    employee_id: new mongoose.Types.ObjectId(),
    office_id: officeB._id,
    status: 'CLOSED_PENDING_SIGNATURE',
    lines: [{ asset_item_id: itemB._id }],
  });

  const app = createApp();
  const superAgent = request.agent(app);
  const managerAAgent = request.agent(app);
  await login(superAgent, 'reports-super@example.com', 'Passw0rd!');
  await login(managerAAgent, 'reports-manager-a@example.com', 'Passw0rd!');

  const requisitionsA = await managerAAgent.get('/api/reports/requisitions');
  assert.equal(requisitionsA.status, 200);
  assert.equal(requisitionsA.body.total, 2);
  assert.equal(
    requisitionsA.body.items.every((row: any) => String(row.office_id) === String(officeA._id)),
    true
  );

  const noncomplianceA = await managerAAgent.get('/api/reports/noncompliance');
  assert.equal(noncomplianceA.status, 200);
  assert.equal(noncomplianceA.body.counts.requisitionsWithoutSignedIssueSlip, 1);
  assert.equal(noncomplianceA.body.counts.returnRequestsWithoutSignedReturnSlip, 1);
  assert.equal(
    noncomplianceA.body.items.every((row: any) => String(row.office_id) === String(officeA._id)),
    true
  );

  const forbiddenCrossOffice = await managerAAgent.get(`/api/reports/noncompliance?officeId=${String(officeB._id)}`);
  assert.equal(forbiddenCrossOffice.status, 403);

  const noncomplianceAll = await superAgent.get('/api/reports/noncompliance');
  assert.equal(noncomplianceAll.status, 200);
  assert.equal(noncomplianceAll.body.counts.requisitionsWithoutSignedIssueSlip, 2);
  assert.equal(noncomplianceAll.body.counts.returnRequestsWithoutSignedReturnSlip, 2);

  const noncomplianceOfficeB = await superAgent.get(`/api/reports/noncompliance?officeId=${String(officeB._id)}`);
  assert.equal(noncomplianceOfficeB.status, 200);
  assert.equal(noncomplianceOfficeB.body.counts.requisitionsWithoutSignedIssueSlip, 1);
  assert.equal(noncomplianceOfficeB.body.counts.returnRequestsWithoutSignedReturnSlip, 1);

  await mongoose.disconnect();
  await mongo.stop();
  console.log('Reports runtime test passed.');
}

main().catch(async (error) => {
  console.error('Reports runtime test failed.');
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore cleanup errors
  }
  process.exit(1);
});
