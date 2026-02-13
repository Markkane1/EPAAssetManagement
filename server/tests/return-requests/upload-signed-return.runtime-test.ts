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
  const { EmployeeModel } = await import('../../src/models/employee.model');
  const { AssetModel } = await import('../../src/models/asset.model');
  const { AssetItemModel } = await import('../../src/models/assetItem.model');
  const { RecordModel } = await import('../../src/models/record.model');
  const { DocumentModel } = await import('../../src/models/document.model');
  const { DocumentVersionModel } = await import('../../src/models/documentVersion.model');
  const { ReturnRequestModel } = await import('../../src/models/returnRequest.model');

  await connectDatabase();

  const office = await OfficeModel.create({
    name: 'Signed Return Lab',
    type: 'LAB',
    is_headoffice: false,
  });

  const passwordHash = await bcrypt.hash('Passw0rd!', 10);
  const user = await UserModel.create({
    email: 'signed-return-admin@example.com',
    password_hash: passwordHash,
    role: 'location_admin',
    first_name: 'Signed',
    last_name: 'Return',
    location_id: office._id,
  });

  const employee = await EmployeeModel.create({
    first_name: 'Emp',
    last_name: 'Return',
    email: 'emp.return@example.com',
    location_id: office._id,
    is_active: true,
  });

  const asset = await AssetModel.create({
    name: 'Monitor',
    quantity: 1,
    is_active: true,
  });
  const item = await AssetItemModel.create({
    asset_id: asset._id,
    location_id: office._id,
    assignment_status: 'Unassigned',
    item_status: 'Available',
    is_active: true,
  });

  const record = await RecordModel.create({
    record_type: 'RETURN',
    reference_no: `RET-${Date.now()}`,
    office_id: office._id,
    status: 'Draft',
    created_by_user_id: user._id,
    employee_id: employee._id,
    notes: 'Pending signed return upload',
  });

  const receiptDoc = await DocumentModel.create({
    title: 'Return Receipt Draft',
    doc_type: 'ReturnSlip',
    status: 'Draft',
    office_id: office._id,
    created_by_user_id: user._id,
  });

  const returnRequest = await ReturnRequestModel.create({
    employee_id: employee._id,
    office_id: office._id,
    record_id: record._id,
    receipt_document_id: receiptDoc._id,
    status: 'CLOSED_PENDING_SIGNATURE',
    lines: [{ asset_item_id: item._id }],
  });

  const app = createApp();
  const agent = request.agent(app);
  await login(agent, 'signed-return-admin@example.com', 'Passw0rd!');

  const noFileRes = await agent.post(`/api/return-requests/${returnRequest.id}/upload-signed-return`).send({});
  assert.equal(noFileRes.status, 400);

  const pendingAfterNoFile = await ReturnRequestModel.findById(returnRequest._id).lean();
  assert.equal(String(pendingAfterNoFile?.status), 'CLOSED_PENDING_SIGNATURE');

  const signedFilePath = writeTempPdf('signed-return');
  const uploadRes = await agent
    .post(`/api/return-requests/${returnRequest.id}/upload-signed-return`)
    .attach('signedReturnFile', signedFilePath, { contentType: 'application/pdf' });

  assert.equal(uploadRes.status, 200, `Upload signed return failed: ${uploadRes.status} ${JSON.stringify(uploadRes.body)}`);
  assert.equal(uploadRes.body.returnRequest.status, 'CLOSED');
  assert.equal(uploadRes.body.record.status, 'Completed');
  assert.equal(uploadRes.body.document.doc_type, 'ReturnSlip');
  assert.equal(uploadRes.body.document.status, 'Final');

  const rrAfter = await ReturnRequestModel.findById(returnRequest._id).lean();
  assert.equal(String(rrAfter?.status), 'CLOSED');

  const recordAfter = await RecordModel.findById(record._id).lean();
  assert.equal(String(recordAfter?.status), 'Completed');

  const docAfter = await DocumentModel.findById(receiptDoc._id).lean();
  assert.equal(String(docAfter?.status), 'Final');

  const latestVersion = await DocumentVersionModel.findOne({ document_id: receiptDoc._id })
    .sort({ version_no: -1 })
    .lean();
  assert.ok(latestVersion, 'Signed return should create document version');
  const versionPath = path.resolve(process.cwd(), String(latestVersion?.file_path || ''));
  assert.ok(fs.existsSync(versionPath), `Uploaded signed return file should exist at ${versionPath}`);

  fs.unlinkSync(signedFilePath);
  fs.unlinkSync(versionPath);
  await mongoose.disconnect();
  await mongo.stop();
  console.log('Upload signed return runtime test passed.');
}

main().catch(async (error) => {
  console.error('Upload signed return runtime test failed.');
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore cleanup errors
  }
  process.exit(1);
});
