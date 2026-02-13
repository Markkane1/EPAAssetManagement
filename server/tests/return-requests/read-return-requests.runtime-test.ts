import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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
  const { AssetModel } = await import('../../src/models/asset.model');
  const { AssetItemModel } = await import('../../src/models/assetItem.model');
  const { RecordModel } = await import('../../src/models/record.model');
  const { ReturnRequestModel } = await import('../../src/models/returnRequest.model');
  const { DocumentModel } = await import('../../src/models/document.model');
  const { DocumentVersionModel } = await import('../../src/models/documentVersion.model');
  const { DocumentLinkModel } = await import('../../src/models/documentLink.model');

  await connectDatabase();

  const officeA = await OfficeModel.create({
    name: 'Return Read Office A',
    type: 'LAB',
    is_headoffice: false,
  });
  const officeB = await OfficeModel.create({
    name: 'Return Read Office B',
    type: 'LAB',
    is_headoffice: false,
  });

  const passwordHash = await bcrypt.hash('Passw0rd!', 10);
  const superAdmin = await UserModel.create({
    email: 'rr-super@example.com',
    password_hash: passwordHash,
    role: 'super_admin',
    first_name: 'Super',
    last_name: 'Admin',
  });
  const managerA = await UserModel.create({
    email: 'rr-manager-a@example.com',
    password_hash: passwordHash,
    role: 'location_admin',
    first_name: 'Manager',
    last_name: 'A',
    location_id: officeA._id,
  });
  const employeeUserA = await UserModel.create({
    email: 'rr-employee-a@example.com',
    password_hash: passwordHash,
    role: 'user',
    first_name: 'Employee',
    last_name: 'A',
    location_id: officeA._id,
  });
  const outsiderUserA = await UserModel.create({
    email: 'rr-outsider-a@example.com',
    password_hash: passwordHash,
    role: 'user',
    first_name: 'Outsider',
    last_name: 'A',
    location_id: officeA._id,
  });

  const employeeA = await EmployeeModel.create({
    first_name: 'Return',
    last_name: 'Owner',
    email: 'return.owner@example.com',
    user_id: employeeUserA._id,
    location_id: officeA._id,
    is_active: true,
  });
  await EmployeeModel.create({
    first_name: 'Return',
    last_name: 'Other',
    email: 'return.other@example.com',
    user_id: outsiderUserA._id,
    location_id: officeA._id,
    is_active: true,
  });
  const employeeB = await EmployeeModel.create({
    first_name: 'Return',
    last_name: 'B',
    email: 'return.b@example.com',
    location_id: officeB._id,
    is_active: true,
  });

  const asset = await AssetModel.create({
    name: 'Return Read Asset',
    quantity: 3,
    is_active: true,
  });
  const item1 = await AssetItemModel.create({
    asset_id: asset._id,
    location_id: officeA._id,
    assignment_status: 'Assigned',
    item_status: 'Assigned',
    is_active: true,
  });
  const item2 = await AssetItemModel.create({
    asset_id: asset._id,
    location_id: officeA._id,
    assignment_status: 'Assigned',
    item_status: 'Assigned',
    is_active: true,
  });
  const item3 = await AssetItemModel.create({
    asset_id: asset._id,
    location_id: officeB._id,
    assignment_status: 'Assigned',
    item_status: 'Assigned',
    is_active: true,
  });

  const recordA1 = await RecordModel.create({
    record_type: 'RETURN',
    reference_no: `RR-READ-1-${Date.now()}`,
    office_id: officeA._id,
    status: 'Draft',
    created_by_user_id: managerA._id,
    employee_id: employeeA._id,
  });
  const recordA2 = await RecordModel.create({
    record_type: 'RETURN',
    reference_no: `RR-READ-2-${Date.now()}`,
    office_id: officeA._id,
    status: 'Draft',
    created_by_user_id: managerA._id,
    employee_id: employeeA._id,
  });
  const recordB = await RecordModel.create({
    record_type: 'RETURN',
    reference_no: `RR-READ-B-${Date.now()}`,
    office_id: officeB._id,
    status: 'Draft',
    created_by_user_id: superAdmin._id,
    employee_id: employeeB._id,
  });

  const receiptDoc = await DocumentModel.create({
    title: 'Existing Return Receipt',
    doc_type: 'ReturnSlip',
    status: 'Draft',
    office_id: officeA._id,
    created_by_user_id: managerA._id,
  });
  const uploadsDir = path.resolve(process.cwd(), 'uploads', 'documents');
  fs.mkdirSync(uploadsDir, { recursive: true });
  const existingReceiptFile = path.join(uploadsDir, `existing-return-receipt-${Date.now()}.pdf`);
  fs.writeFileSync(existingReceiptFile, '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
  const existingRelativePath = path
    .join('uploads', 'documents', path.basename(existingReceiptFile))
    .replace(/\\/g, '/');
  await DocumentVersionModel.create({
    document_id: receiptDoc._id,
    version_no: 1,
    file_name: 'existing-return-receipt.pdf',
    mime_type: 'application/pdf',
    size_bytes: fs.statSync(existingReceiptFile).size,
    storage_key: existingRelativePath,
    file_path: existingRelativePath,
    file_url: '/api/documents/versions/mock-return-receipt/download',
    sha256: 'd'.repeat(64),
    uploaded_by_user_id: managerA._id,
    uploaded_at: new Date(),
  });
  await DocumentLinkModel.create({
    document_id: receiptDoc._id,
    entity_type: 'Record',
    entity_id: recordA1._id,
    required_for_status: 'Completed',
  });

  const rrWithDoc = await ReturnRequestModel.create({
    employee_id: employeeA._id,
    office_id: officeA._id,
    record_id: recordA1._id,
    receipt_document_id: receiptDoc._id,
    status: 'CLOSED_PENDING_SIGNATURE',
    lines: [{ asset_item_id: item1._id }],
  });
  const rrWithoutDoc = await ReturnRequestModel.create({
    employee_id: employeeA._id,
    office_id: officeA._id,
    record_id: recordA2._id,
    status: 'CLOSED_PENDING_SIGNATURE',
    lines: [{ asset_item_id: item2._id }],
  });
  const rrOfficeB = await ReturnRequestModel.create({
    employee_id: employeeB._id,
    office_id: officeB._id,
    record_id: recordB._id,
    status: 'SUBMITTED',
    lines: [{ asset_item_id: item3._id }],
  });

  const app = createApp();
  const managerAgent = request.agent(app);
  const superAgent = request.agent(app);
  const employeeAgent = request.agent(app);
  const outsiderAgent = request.agent(app);
  await login(managerAgent, 'rr-manager-a@example.com', 'Passw0rd!');
  await login(superAgent, 'rr-super@example.com', 'Passw0rd!');
  await login(employeeAgent, 'rr-employee-a@example.com', 'Passw0rd!');
  await login(outsiderAgent, 'rr-outsider-a@example.com', 'Passw0rd!');

  const listScoped = await managerAgent.get('/api/return-requests');
  assert.equal(listScoped.status, 200);
  assert.equal(listScoped.body.total, 2);
  assert.equal(listScoped.body.data.length, 2);
  assert.equal(String(listScoped.body.data[0].office_id), String(officeA._id));

  const listEmployeeFilter = await managerAgent
    .get('/api/return-requests')
    .query({ employeeId: String(employeeA._id), status: 'CLOSED_PENDING_SIGNATURE' });
  assert.equal(listEmployeeFilter.status, 200);
  assert.equal(listEmployeeFilter.body.total, 2);

  const listCrossOfficeForbidden = await managerAgent
    .get('/api/return-requests')
    .query({ officeId: String(officeB._id) });
  assert.equal(listCrossOfficeForbidden.status, 403);

  const listSuperFiltered = await superAgent.get('/api/return-requests').query({ officeId: String(officeB._id) });
  assert.equal(listSuperFiltered.status, 200);
  assert.equal(listSuperFiltered.body.total, 1);
  assert.equal(String(listSuperFiltered.body.data[0].id || listSuperFiltered.body.data[0]._id), String(rrOfficeB._id));

  const detailScoped = await managerAgent.get(`/api/return-requests/${rrWithDoc.id}`);
  assert.equal(detailScoped.status, 200);
  assert.equal(String(detailScoped.body.returnRequest.id || detailScoped.body.returnRequest._id), String(rrWithDoc._id));
  assert.equal(detailScoped.body.lines.length, 1);
  assert.ok(detailScoped.body.documents.receiptDocument);
  assert.ok(Array.isArray(detailScoped.body.documents.linked));

  const detailCrossOfficeForbidden = await managerAgent.get(`/api/return-requests/${rrOfficeB.id}`);
  assert.equal(detailCrossOfficeForbidden.status, 403);

  const existingReceiptRes = await managerAgent.get(`/api/return-requests/${rrWithDoc.id}/return-receipt.pdf`);
  assert.equal(existingReceiptRes.status, 200);
  assert.match(String(existingReceiptRes.headers['content-type'] || ''), /application\/pdf/i);

  const generatedReceiptRes = await employeeAgent.get(`/api/return-requests/${rrWithoutDoc.id}/return-receipt.pdf`);
  assert.equal(generatedReceiptRes.status, 200);
  assert.match(String(generatedReceiptRes.headers['content-type'] || ''), /application\/pdf/i);

  const rrWithoutDocAfter = await ReturnRequestModel.findById(rrWithoutDoc._id).lean();
  assert.ok(rrWithoutDocAfter?.receipt_document_id, 'receipt_document_id should be stored after generation');
  const generatedVersion = await DocumentVersionModel.findOne({
    document_id: rrWithoutDocAfter?.receipt_document_id,
  })
    .sort({ version_no: -1 })
    .lean();
  assert.ok(generatedVersion, 'Generated receipt should create a document version');
  const generatedReceiptAbsolute = path.resolve(process.cwd(), String(generatedVersion?.file_path || ''));
  assert.ok(fs.existsSync(generatedReceiptAbsolute), `Generated return receipt should exist at ${generatedReceiptAbsolute}`);

  const outsiderForbidden = await outsiderAgent.get(`/api/return-requests/${rrWithoutDoc.id}/return-receipt.pdf`);
  assert.equal(outsiderForbidden.status, 403);

  if (fs.existsSync(existingReceiptFile)) fs.unlinkSync(existingReceiptFile);
  if (fs.existsSync(generatedReceiptAbsolute)) fs.unlinkSync(generatedReceiptAbsolute);
  await mongoose.disconnect();
  await mongo.stop();
  console.log('Return request read endpoints runtime test passed.');
}

main().catch(async (error) => {
  console.error('Return request read endpoints runtime test failed.');
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore cleanup errors
  }
  process.exit(1);
});
