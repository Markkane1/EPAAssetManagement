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
  const { AssetModel } = await import('../../../../server/src/models/asset.model');
  const { AssetItemModel } = await import('../../../../server/src/models/assetItem.model');
  const { DocumentModel } = await import('../../../../server/src/models/document.model');
  const { ApprovalMatrixRequestModel } = await import('../../../../server/src/models/approvalMatrixRequest.model');

  await connectDatabase();

  const officeA = await OfficeModel.create({
    name: 'District Lab A',
    type: 'DISTRICT_LAB',
  });
  const officeB = await OfficeModel.create({
    name: 'District Lab B',
    type: 'DISTRICT_LAB',
  });

  const passwordHash = await bcrypt.hash('Passw0rd!', 10);
  await UserModel.create({
    email: 'transfer-maker@example.com',
    password_hash: passwordHash,
    role: 'office_head',
    first_name: 'Maker',
    last_name: 'Head',
    location_id: officeA._id,
  });
  await UserModel.create({
    email: 'transfer-checker@example.com',
    password_hash: passwordHash,
    role: 'office_head',
    first_name: 'Checker',
    last_name: 'Head',
    location_id: officeA._id,
  });
  await UserModel.create({
    email: 'transfer-admin@example.com',
    password_hash: passwordHash,
    role: 'org_admin',
    first_name: 'Org',
    last_name: 'Admin',
  });

  const expensiveAsset = await AssetModel.create({
    name: 'High Value Analyzer',
    quantity: 1,
    unit_price: 250000,
    is_active: true,
  });
  const expensiveItem = await AssetItemModel.create({
    asset_id: expensiveAsset._id,
    holder_type: 'OFFICE',
    holder_id: officeA._id,
    assignment_status: 'Unassigned',
    item_status: 'Available',
    is_active: true,
  });

  const approvalDocument = await DocumentModel.create({
    title: 'Approval Order',
    doc_type: 'Other',
    status: 'Final',
    office_id: officeA._id,
    created_by_user_id: (await UserModel.findOne({ email: 'transfer-maker@example.com' }))!._id,
  });

  const app = createApp();
  const makerAgent = request.agent(app);
  const checkerAgent = request.agent(app);
  const adminAgent = request.agent(app);
  await login(makerAgent, 'transfer-maker@example.com', 'Passw0rd!');
  await login(checkerAgent, 'transfer-checker@example.com', 'Passw0rd!');
  await login(adminAgent, 'transfer-admin@example.com', 'Passw0rd!');

  const createTransferRes = await makerAgent.post('/api/transfers').send({
    fromOfficeId: officeA.id,
    toOfficeId: officeB.id,
    approvalOrderDocumentId: approvalDocument.id,
    lines: [{ assetItemId: expensiveItem.id }],
    notes: 'High value transfer request',
  });
  assert.equal(
    createTransferRes.status,
    201,
    `Expected transfer create to succeed, got ${createTransferRes.status}: ${JSON.stringify(createTransferRes.body)}`
  );
  const transferId = String(createTransferRes.body?.id || createTransferRes.body?._id || '');
  assert.ok(transferId, 'transfer id is required');

  const approveInitialRes = await makerAgent.post(`/api/transfers/${transferId}/approve`).send({});
  assert.equal(approveInitialRes.status, 409, 'High value transfer should require approval workflow');
  assert.match(
    String(approveInitialRes.body?.message || ''),
    /Approval workflow is required/i
  );
  const approvalRequestId = String(
    approveInitialRes.body?.details?.approval_request?.id
      || approveInitialRes.body?.details?.approval_request?._id
      || ''
  );
  assert.ok(approvalRequestId, 'approval request id should be returned in 409 details');

  const makerSelfDecisionRes = await makerAgent
    .post(`/api/approval-matrix/${approvalRequestId}/decide`)
    .send({ decision: 'APPROVED' });
  assert.equal(makerSelfDecisionRes.status, 403, 'Maker must not self-approve');

  const checkerDecisionRes = await checkerAgent
    .post(`/api/approval-matrix/${approvalRequestId}/decide`)
    .send({ decision: 'APPROVED', notes: 'Office check ok' });
  assert.equal(checkerDecisionRes.status, 200);
  assert.equal(checkerDecisionRes.body?.status, 'Pending');

  const adminDecisionRes = await adminAgent
    .post(`/api/approval-matrix/${approvalRequestId}/decide`)
    .send({ decision: 'APPROVED', notes: 'Admin check ok' });
  assert.equal(adminDecisionRes.status, 200);
  assert.equal(adminDecisionRes.body?.status, 'Approved');

  const approveFinalRes = await makerAgent.post(`/api/transfers/${transferId}/approve`).send({});
  assert.equal(
    approveFinalRes.status,
    200,
    `Expected transfer approve success after approvals, got ${approveFinalRes.status}: ${JSON.stringify(approveFinalRes.body)}`
  );
  assert.equal(String(approveFinalRes.body?.status || ''), 'APPROVED');

  const workflowRow = await ApprovalMatrixRequestModel.findById(approvalRequestId).lean();
  assert.ok(workflowRow, 'Approval matrix workflow should exist');
  assert.equal(String(workflowRow?.status || ''), 'Executed');
  assert.equal(Number(workflowRow?.approvals?.length || 0), 2);

  await mongoose.disconnect();
  await mongo.stop();
  console.log('Transfer approval matrix runtime test passed.');
}

main().catch(async (error) => {
  console.error('Transfer approval matrix runtime test failed.');
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore cleanup errors
  }
  process.exit(1);
});
