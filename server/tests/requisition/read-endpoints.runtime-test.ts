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
  const { DocumentModel } = await import('../../src/models/document.model');
  const { DocumentVersionModel } = await import('../../src/models/documentVersion.model');
  const { DocumentLinkModel } = await import('../../src/models/documentLink.model');

  await connectDatabase();

  const officeA = await OfficeModel.create({ name: 'Office A', type: 'LAB', is_headoffice: false });
  const officeB = await OfficeModel.create({ name: 'Office B', type: 'LAB', is_headoffice: false });

  const passwordHash = await bcrypt.hash('Passw0rd!', 10);
  const superAdmin = await UserModel.create({
    email: 'requisition-super@example.com',
    password_hash: passwordHash,
    role: 'super_admin',
    first_name: 'Super',
    last_name: 'Admin',
  });
  await UserModel.create({
    email: 'requisition-manager-a@example.com',
    password_hash: passwordHash,
    role: 'location_admin',
    first_name: 'Manager',
    last_name: 'A',
    location_id: officeA._id,
  });

  const reqA = await RequisitionModel.create({
    file_number: `REQ-READ-A-${Date.now()}`,
    office_id: officeA._id,
    issuing_office_id: officeA._id,
    submitted_by_user_id: superAdmin._id,
    status: 'PENDING_VERIFICATION',
  });
  const reqB = await RequisitionModel.create({
    file_number: `REQ-READ-B-${Date.now()}`,
    office_id: officeB._id,
    issuing_office_id: officeB._id,
    submitted_by_user_id: superAdmin._id,
    status: 'VERIFIED_APPROVED',
  });

  await RequisitionLineModel.create({
    requisition_id: reqA._id,
    line_type: 'MOVEABLE',
    requested_name: 'Laptop',
    requested_quantity: 1,
    approved_quantity: 1,
    fulfilled_quantity: 0,
    status: 'PENDING_ASSIGNMENT',
  });
  await RequisitionLineModel.create({
    requisition_id: reqA._id,
    line_type: 'CONSUMABLE',
    requested_name: 'Printer Ink',
    requested_quantity: 2,
    approved_quantity: 2,
    fulfilled_quantity: 0,
    status: 'PENDING_ASSIGNMENT',
  });

  const reqForm = await DocumentModel.create({
    title: 'Requisition Form A',
    doc_type: 'RequisitionForm',
    status: 'Final',
    office_id: officeA._id,
    created_by_user_id: superAdmin._id,
  });
  const issueSlipOld = await DocumentModel.create({
    title: 'Issue Slip A Old',
    doc_type: 'IssueSlip',
    status: 'Draft',
    office_id: officeA._id,
    created_by_user_id: superAdmin._id,
  });
  const issueSlipLatest = await DocumentModel.create({
    title: 'Issue Slip A Latest',
    doc_type: 'IssueSlip',
    status: 'Final',
    office_id: officeA._id,
    created_by_user_id: superAdmin._id,
  });

  await DocumentVersionModel.create({
    document_id: reqForm._id,
    version_no: 1,
    file_name: 'requisition-form.pdf',
    mime_type: 'application/pdf',
    size_bytes: 123,
    storage_key: 'uploads/documents/requisition-form.pdf',
    file_path: 'uploads/documents/requisition-form.pdf',
    file_url: '/api/documents/versions/mock/download',
    sha256: 'a'.repeat(64),
    uploaded_by_user_id: superAdmin._id,
    uploaded_at: new Date(),
  });
  await DocumentVersionModel.create({
    document_id: issueSlipOld._id,
    version_no: 1,
    file_name: 'issue-slip-old.pdf',
    mime_type: 'application/pdf',
    size_bytes: 456,
    storage_key: 'uploads/documents/issue-slip-old.pdf',
    file_path: 'uploads/documents/issue-slip-old.pdf',
    file_url: '/api/documents/versions/mock-old/download',
    sha256: 'b'.repeat(64),
    uploaded_by_user_id: superAdmin._id,
    uploaded_at: new Date(),
  });
  await DocumentVersionModel.create({
    document_id: issueSlipLatest._id,
    version_no: 2,
    file_name: 'issue-slip-latest.pdf',
    mime_type: 'application/pdf',
    size_bytes: 789,
    storage_key: 'uploads/documents/issue-slip-latest.pdf',
    file_path: 'uploads/documents/issue-slip-latest.pdf',
    file_url: '/api/documents/versions/mock-latest/download',
    sha256: 'c'.repeat(64),
    uploaded_by_user_id: superAdmin._id,
    uploaded_at: new Date(),
  });

  await DocumentLinkModel.create({
    document_id: reqForm._id,
    entity_type: 'Requisition',
    entity_id: reqA._id,
    required_for_status: null,
  });
  await DocumentLinkModel.create({
    document_id: issueSlipOld._id,
    entity_type: 'Requisition',
    entity_id: reqA._id,
    required_for_status: null,
  });
  await DocumentLinkModel.create({
    document_id: issueSlipLatest._id,
    entity_type: 'Requisition',
    entity_id: reqA._id,
    required_for_status: null,
  });

  const app = createApp();
  const superAgent = request.agent(app);
  const managerAAgent = request.agent(app);
  await login(superAgent, 'requisition-super@example.com', 'Passw0rd!');
  await login(managerAAgent, 'requisition-manager-a@example.com', 'Passw0rd!');

  const listScoped = await managerAAgent.get('/api/requisitions');
  assert.equal(listScoped.status, 200);
  assert.equal(listScoped.body.total, 1);
  assert.equal(listScoped.body.data.length, 1);
  assert.equal(String(listScoped.body.data[0].office_id), String(officeA._id));

  const listByFileNumber = await managerAAgent.get('/api/requisitions').query({ fileNumber: 'read-a' });
  assert.equal(listByFileNumber.status, 200);
  assert.equal(listByFileNumber.body.total, 1);

  const listCrossOfficeForbidden = await managerAAgent
    .get('/api/requisitions')
    .query({ officeId: String(officeB._id) });
  assert.equal(listCrossOfficeForbidden.status, 403);

  const listSuperFiltered = await superAgent.get('/api/requisitions').query({ officeId: String(officeB._id) });
  assert.equal(listSuperFiltered.status, 200);
  assert.equal(listSuperFiltered.body.total, 1);
  assert.equal(String(listSuperFiltered.body.data[0].id || listSuperFiltered.body.data[0]._id), String(reqB._id));

  const detailScoped = await managerAAgent.get(`/api/requisitions/${String(reqA._id)}`);
  assert.equal(detailScoped.status, 200);
  assert.equal(String(detailScoped.body.requisition.id || detailScoped.body.requisition._id), String(reqA._id));
  assert.equal(detailScoped.body.lines.length, 2);
  assert.ok(detailScoped.body.documents.requisitionForm);
  assert.ok(detailScoped.body.documents.issueSlip);
  assert.equal(
    String(detailScoped.body.documents.issueSlip.id || detailScoped.body.documents.issueSlip._id),
    String(issueSlipLatest._id)
  );

  const detailCrossOfficeForbidden = await managerAAgent.get(`/api/requisitions/${String(reqB._id)}`);
  assert.equal(detailCrossOfficeForbidden.status, 403);

  await mongoose.disconnect();
  await mongo.stop();
  console.log('Requisition read endpoints runtime test passed.');
}

main().catch(async (error) => {
  console.error('Requisition read endpoints runtime test failed.');
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore cleanup errors
  }
  process.exit(1);
});
