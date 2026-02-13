import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

async function login(agent: ReturnType<typeof request.agent>, email: string, password: string) {
  const res = await agent.post('/api/auth/login').send({ email, password });
  assert.equal(res.status, 200, `Expected login to succeed for ${email}, got ${res.status}`);
}

function writeTempPdf(name: string) {
  const filePath = path.join(os.tmpdir(), `${name}-${Date.now()}.pdf`);
  fs.writeFileSync(filePath, '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
  return filePath;
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
  const { RecordModel } = await import('../../src/models/record.model');
  const { DocumentModel } = await import('../../src/models/document.model');

  await connectDatabase();

  const office = await OfficeModel.create({
    name: 'District Lab Office',
    type: 'LAB',
    is_headoffice: false,
  });

  const passwordHash = await bcrypt.hash('Passw0rd!', 10);
  const user = await UserModel.create({
    email: 'location-admin@example.com',
    password_hash: passwordHash,
    role: 'location_admin',
    first_name: 'Location',
    last_name: 'Admin',
    location_id: office._id,
  });

  const app = createApp();
  const agent = request.agent(app);
  await login(agent, 'location-admin@example.com', 'Passw0rd!');

  const signedFilePath = writeTempPdf('signed-issuance');

  const issueRecord = await RecordModel.create({
    record_type: 'ISSUE',
    reference_no: `ISS-${Date.now()}-001`,
    office_id: office._id,
    status: 'Draft',
    created_by_user_id: user._id,
    notes: 'Pre-created issue record for signed issuance upload test',
  });

  const requisition = await RequisitionModel.create({
    file_number: `REQ/${Date.now()}-001`,
    office_id: office._id,
    issuing_office_id: office._id,
    requested_by_employee_id: null,
    submitted_by_user_id: user._id,
    fulfilled_by_user_id: user._id,
    record_id: issueRecord._id,
    status: 'FULFILLED_PENDING_SIGNATURE',
  });
  const requisitionId = String(requisition._id);

  const noFileFinalizeRes = await agent.post(`/api/requisitions/${requisitionId}/upload-signed-issuance`).send({});
  assert.equal(noFileFinalizeRes.status, 400, 'Finalize should be blocked without signed upload');

  const pendingAfterNoFile = await RequisitionModel.findById(requisitionId).lean();
  assert.equal(String(pendingAfterNoFile?.status), 'FULFILLED_PENDING_SIGNATURE');

  const finalizeRes = await agent
    .post(`/api/requisitions/${requisitionId}/upload-signed-issuance`)
    .attach('signedIssuanceFile', signedFilePath, { contentType: 'application/pdf' });
  assert.equal(finalizeRes.status, 200, `Signed upload finalize failed: ${finalizeRes.status}`);
  assert.equal(finalizeRes.body.requisition.status, 'FULFILLED');
  assert.equal(finalizeRes.body.record.status, 'Completed');
  assert.equal(finalizeRes.body.document.doc_type, 'IssueSlip');
  assert.equal(finalizeRes.body.document.status, 'Final');

  const requisitionAfterFinalize = await RequisitionModel.findById(requisitionId).lean();
  assert.equal(String(requisitionAfterFinalize?.status), 'FULFILLED');
  assert.ok(requisitionAfterFinalize?.signed_issuance_document_id, 'Signed issuance document id should be set');
  assert.ok(requisitionAfterFinalize?.signed_issuance_uploaded_at, 'Signed issuance uploaded timestamp should be set');

  const issueRecordAfterFinalize = await RecordModel.findById(requisitionAfterFinalize?.record_id).lean();
  assert.equal(String(issueRecordAfterFinalize?.status), 'Completed');

  const issueSlip = await DocumentModel.findById(requisitionAfterFinalize?.signed_issuance_document_id).lean();
  assert.equal(String(issueSlip?.doc_type), 'IssueSlip');
  assert.equal(String(issueSlip?.status), 'Final');

  const manualRequisition = await RequisitionModel.create({
    file_number: 'REQ/2026-002',
    office_id: office._id,
    issuing_office_id: office._id,
    submitted_by_user_id: user._id,
    status: 'PENDING_VERIFICATION',
  });

  await assert.rejects(
    async () => {
      manualRequisition.status = 'FULFILLED';
      await manualRequisition.save();
    },
    /Cannot set requisition status to FULFILLED without signed issuance upload/
  );

  fs.unlinkSync(signedFilePath);
  await mongoose.disconnect();
  await mongo.stop();
  console.log('Requisition signed issuance runtime test passed.');
}

main().catch(async (error) => {
  console.error('Requisition signed issuance runtime test failed.');
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore cleanup errors
  }
  process.exit(1);
});
