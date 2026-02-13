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
  const { RequisitionModel } = await import('../../src/models/requisition.model');
  const { RequisitionLineModel } = await import('../../src/models/requisitionLine.model');
  const { RecordModel } = await import('../../src/models/record.model');
  const { DocumentModel } = await import('../../src/models/document.model');
  const { DocumentLinkModel } = await import('../../src/models/documentLink.model');
  const { AuditLogModel } = await import('../../src/models/auditLog.model');

  await connectDatabase();

  const office = await OfficeModel.create({
    name: 'District Lab Office',
    type: 'LAB',
    is_headoffice: false,
  });

  const passwordHash = await bcrypt.hash('Passw0rd!', 10);
  const user = await UserModel.create({
    email: 'location-admin-adjust@example.com',
    password_hash: passwordHash,
    role: 'location_admin',
    first_name: 'Location',
    last_name: 'Admin',
    location_id: office._id,
  });

  const oldRecord = await RecordModel.create({
    record_type: 'ISSUE',
    reference_no: `ISS-OLD-${Date.now()}`,
    office_id: office._id,
    status: 'Completed',
    created_by_user_id: user._id,
    notes: 'Original fulfillment record',
  });

  const oldIssueSlip = await DocumentModel.create({
    title: 'Issue Slip Original',
    doc_type: 'IssueSlip',
    status: 'Final',
    office_id: office._id,
    created_by_user_id: user._id,
  });

  const requisition = await RequisitionModel.create({
    file_number: `REQ-ADJUST-${Date.now()}`,
    office_id: office._id,
    issuing_office_id: office._id,
    submitted_by_user_id: user._id,
    fulfilled_by_user_id: user._id,
    record_id: oldRecord._id,
    signed_issuance_document_id: oldIssueSlip._id,
    signed_issuance_uploaded_at: new Date(),
    status: 'FULFILLED',
  });

  const line = await RequisitionLineModel.create({
    requisition_id: requisition._id,
    line_type: 'CONSUMABLE',
    requested_name: 'Gloves',
    requested_quantity: 10,
    approved_quantity: 10,
    fulfilled_quantity: 10,
    status: 'ASSIGNED',
    notes: 'Original fulfilled line',
  });

  await DocumentLinkModel.create({
    document_id: oldIssueSlip._id,
    entity_type: 'Requisition',
    entity_id: requisition._id,
    required_for_status: null,
  });
  await DocumentLinkModel.create({
    document_id: oldIssueSlip._id,
    entity_type: 'Record',
    entity_id: oldRecord._id,
    required_for_status: 'Completed',
  });

  const app = createApp();
  const agent = request.agent(app);
  await login(agent, 'location-admin-adjust@example.com', 'Passw0rd!');

  const adjustRes = await agent.post(`/api/requisitions/${requisition.id}/adjust`).send({
    adjustments: [
      { lineId: line.id, previousIssuedQuantity: 10, adjustedIssuedQuantity: 8 },
      { note: 'Replace two units with alternate stock' },
    ],
    reason: 'Signed slip had quantity mismatch',
  });

  assert.equal(adjustRes.status, 200, `Adjust request failed: ${adjustRes.status} ${JSON.stringify(adjustRes.body)}`);
  assert.equal(adjustRes.body.requisition.status, 'FULFILLED_PENDING_SIGNATURE');
  assert.ok(adjustRes.body.newRecord?.id || adjustRes.body.newRecord?._id, 'New issue record should be created');
  assert.notEqual(
    String(adjustRes.body.previousRecord.id || adjustRes.body.previousRecord._id),
    String(adjustRes.body.newRecord.id || adjustRes.body.newRecord._id),
    'Adjustment must create a new record'
  );

  const requisitionAfterAdjust = await RequisitionModel.findById(requisition._id).lean();
  assert.equal(String(requisitionAfterAdjust?.status), 'FULFILLED_PENDING_SIGNATURE');
  assert.equal(requisitionAfterAdjust?.signed_issuance_document_id, null);
  assert.equal(requisitionAfterAdjust?.signed_issuance_uploaded_at, null);
  assert.notEqual(String(requisitionAfterAdjust?.record_id), String(oldRecord._id));

  const noFileFinalizeRes = await agent.post(`/api/requisitions/${requisition.id}/upload-signed-issuance`).send({});
  assert.equal(noFileFinalizeRes.status, 400, 'Adjusted requisition should require a new signed upload');
  const stillPendingAfterNoFile = await RequisitionModel.findById(requisition._id).lean();
  assert.equal(String(stillPendingAfterNoFile?.status), 'FULFILLED_PENDING_SIGNATURE');

  const oldRecordAfterAdjust = await RecordModel.findById(oldRecord._id).lean();
  assert.equal(String(oldRecordAfterAdjust?.status), 'Completed');
  assert.equal(String(oldRecordAfterAdjust?.record_type), 'ISSUE');

  const newRecordAfterAdjust = await RecordModel.findById(requisitionAfterAdjust?.record_id).lean();
  assert.ok(newRecordAfterAdjust, 'New issue record should exist');
  assert.equal(String(newRecordAfterAdjust?.record_type), 'ISSUE');
  assert.equal(String(newRecordAfterAdjust?.status), 'Draft');
  assert.match(String(newRecordAfterAdjust?.notes || ''), /Signed slip had quantity mismatch/);

  const oldIssueSlipAfterAdjust = await DocumentModel.findById(oldIssueSlip._id).lean();
  assert.equal(String(oldIssueSlipAfterAdjust?.status), 'Archived');

  const lineAfterAdjust = await RequisitionLineModel.findById(line._id).lean();
  assert.equal(Number(lineAfterAdjust?.fulfilled_quantity), 10);
  assert.equal(String(lineAfterAdjust?.status), 'ASSIGNED');

  const auditEntry = await AuditLogModel.findOne({
    action: 'REQUISITION_ADJUST',
    entity_type: 'Requisition',
    entity_id: requisition._id,
  }).lean();
  assert.ok(auditEntry, 'Adjustment audit entry should be written');

  await mongoose.disconnect();
  await mongo.stop();
  console.log('Requisition adjust runtime test passed.');
}

main().catch(async (error) => {
  console.error('Requisition adjust runtime test failed.');
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore cleanup errors
  }
  process.exit(1);
});
