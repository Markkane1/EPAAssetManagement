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
  const { AssignmentModel } = await import('../../src/models/assignment.model');
  const { ReturnRequestModel } = await import('../../src/models/returnRequest.model');
  const { RecordModel } = await import('../../src/models/record.model');
  const { DocumentModel } = await import('../../src/models/document.model');
  const { DocumentVersionModel } = await import('../../src/models/documentVersion.model');

  await connectDatabase();

  const office = await OfficeModel.create({
    name: 'Receive Return Lab',
    type: 'LAB',
    is_headoffice: false,
  });

  const passwordHash = await bcrypt.hash('Passw0rd!', 10);
  await UserModel.create({
    email: 'receiver@example.com',
    password_hash: passwordHash,
    role: 'location_admin',
    first_name: 'Office',
    last_name: 'Receiver',
    location_id: office._id,
  });

  const employee = await EmployeeModel.create({
    first_name: 'Return',
    last_name: 'Employee',
    email: 'employee.return@example.com',
    location_id: office._id,
    is_active: true,
  });

  const asset = await AssetModel.create({
    name: 'Desktop Unit',
    quantity: 2,
    is_active: true,
  });

  const itemA = await AssetItemModel.create({
    asset_id: asset._id,
    location_id: office._id,
    assignment_status: 'Assigned',
    item_status: 'Assigned',
    is_active: true,
  });
  const itemB = await AssetItemModel.create({
    asset_id: asset._id,
    location_id: office._id,
    assignment_status: 'Assigned',
    item_status: 'Assigned',
    is_active: true,
  });

  const assignmentA = await AssignmentModel.create({
    asset_item_id: itemA._id,
    employee_id: employee._id,
    assigned_date: new Date(),
    is_active: true,
  });
  const assignmentB = await AssignmentModel.create({
    asset_item_id: itemB._id,
    employee_id: employee._id,
    assigned_date: new Date(),
    is_active: true,
  });

  const returnRequest = await ReturnRequestModel.create({
    employee_id: employee._id,
    office_id: office._id,
    status: 'SUBMITTED',
    lines: [{ asset_item_id: itemA._id }, { asset_item_id: itemB._id }],
  });

  const app = createApp();
  const agent = request.agent(app);
  await login(agent, 'receiver@example.com', 'Passw0rd!');

  const receiveRes = await agent.post(`/api/return-requests/${returnRequest.id}/receive`).send({});
  assert.equal(
    receiveRes.status,
    200,
    `receive request failed: ${receiveRes.status} ${JSON.stringify(receiveRes.body)}`
  );
  assert.equal(receiveRes.body.returnRequest.status, 'CLOSED_PENDING_SIGNATURE');
  assert.equal(receiveRes.body.closedAssignmentIds.length, 2);

  const assignmentAAfter = await AssignmentModel.findById(assignmentA._id).lean();
  const assignmentBAfter = await AssignmentModel.findById(assignmentB._id).lean();
  assert.equal(Boolean(assignmentAAfter?.is_active), false);
  assert.equal(Boolean(assignmentBAfter?.is_active), false);
  assert.ok(assignmentAAfter?.returned_date);
  assert.ok(assignmentBAfter?.returned_date);

  const itemAAfter = await AssetItemModel.findById(itemA._id).lean();
  const itemBAfter = await AssetItemModel.findById(itemB._id).lean();
  assert.equal(String(itemAAfter?.assignment_status), 'Unassigned');
  assert.equal(String(itemBAfter?.assignment_status), 'Unassigned');

  const rrAfter = await ReturnRequestModel.findById(returnRequest._id).lean();
  assert.equal(String(rrAfter?.status), 'CLOSED_PENDING_SIGNATURE');
  assert.ok(rrAfter?.record_id);
  assert.ok(rrAfter?.receipt_document_id);

  const record = await RecordModel.findById(rrAfter?.record_id).lean();
  assert.ok(record);
  assert.equal(String(record?.record_type), 'RETURN');
  assert.equal(String(record?.status), 'Draft');

  const receiptDoc = await DocumentModel.findById(rrAfter?.receipt_document_id).lean();
  assert.ok(receiptDoc);
  assert.equal(String(receiptDoc?.doc_type), 'ReturnSlip');
  assert.equal(String(receiptDoc?.status), 'Draft');

  const version = await DocumentVersionModel.findOne({ document_id: rrAfter?.receipt_document_id }).lean();
  assert.ok(version);
  const versionPath = path.resolve(process.cwd(), String(version?.file_path || ''));
  assert.ok(fs.existsSync(versionPath), `Receipt PDF should exist at ${versionPath}`);
  fs.unlinkSync(versionPath);

  await mongoose.disconnect();
  await mongo.stop();
  console.log('Return request receive runtime test passed.');
}

main().catch(async (error) => {
  console.error('Return request receive runtime test failed.');
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore cleanup errors
  }
  process.exit(1);
});
