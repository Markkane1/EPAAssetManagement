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
    instanceOpts: [{ launchTimeout: 30000 }],
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
  const { CategoryModel } = await import('../../../../server/src/models/category.model');
  const { UserModel } = await import('../../../../server/src/models/user.model');
  const { ConsumableUnitModel } = await import('../../../../server/src/modules/consumables/models/consumableUnit.model');
  const { ConsumableItemModel } = await import('../../../../server/src/modules/consumables/models/consumableItem.model');
  const { ConsumableLotModel } = await import('../../../../server/src/modules/consumables/models/consumableLot.model');
  const { ConsumableBalanceModel } = await import('../../../../server/src/modules/consumables/models/consumableBalance.model');
  const { ConsumableInventoryBalanceModel } = await import(
    '../../../../server/src/modules/consumables/models/consumableInventoryBalance.model'
  );
  const { ConsumableReasonCodeModel } = await import('../../../../server/src/modules/consumables/models/consumableReasonCode.model');
  const { ApprovalMatrixRequestModel } = await import('../../../../server/src/models/approvalMatrixRequest.model');

  await connectDatabase();

  const office = await OfficeModel.create({
    name: 'District Lab Office',
    type: 'DISTRICT_LAB',
  });

  const passwordHash = await bcrypt.hash('Passw0rd!', 10);
  const maker = await UserModel.create({
    email: 'cons-maker@example.com',
    password_hash: passwordHash,
    role: 'caretaker',
    first_name: 'Cons',
    last_name: 'Maker',
    location_id: office._id,
  });
  await UserModel.create({
    email: 'cons-office-head@example.com',
    password_hash: passwordHash,
    role: 'office_head',
    first_name: 'Cons',
    last_name: 'Head',
    location_id: office._id,
  });
  await UserModel.create({
    email: 'cons-compliance@example.com',
    password_hash: passwordHash,
    role: 'compliance_auditor',
    first_name: 'Cons',
    last_name: 'Compliance',
    location_id: office._id,
  });

  await ConsumableUnitModel.create({
    code: 'EA',
    name: 'Each',
    group: 'count',
    to_base: 1,
    aliases: ['each'],
    is_active: true,
  });

  const labOnlyCategory = await CategoryModel.create({
    name: 'LAB Scope Consumables',
    asset_type: 'CONSUMABLE',
    scope: 'LAB_ONLY',
  });
  const generalCategory = await CategoryModel.create({
    name: 'General Scope Consumables',
    asset_type: 'CONSUMABLE',
    scope: 'GENERAL',
  });

  const labOnlyItem = await ConsumableItemModel.create({
    name: 'Reactive Solvent',
    category_id: labOnlyCategory._id,
    base_uom: 'EA',
    is_chemical: true,
    requires_lot_tracking: true,
  });
  const generalItem = await ConsumableItemModel.create({
    name: 'Disposable Gloves',
    category_id: generalCategory._id,
    base_uom: 'EA',
    requires_lot_tracking: true,
  });

  const expiry = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
  const labLot = await ConsumableLotModel.create({
    consumable_id: labOnlyItem._id,
    holder_type: 'OFFICE',
    holder_id: office._id,
    batch_no: 'LAB-ISSUE-001',
    expiry_date: expiry,
    qty_received: 500,
    qty_available: 500,
    received_by_user_id: maker._id,
    source_type: 'procurement',
  });
  const generalLot = await ConsumableLotModel.create({
    consumable_id: generalItem._id,
    holder_type: 'OFFICE',
    holder_id: office._id,
    batch_no: 'GEN-DISP-001',
    expiry_date: expiry,
    qty_received: 500,
    qty_available: 500,
    received_by_user_id: maker._id,
    source_type: 'procurement',
  });
  await ConsumableBalanceModel.create([
    {
      holder_type: 'OFFICE',
      holder_id: office._id,
      consumable_id: generalItem._id,
      qty_on_hand: 500,
      qty_reserved: 0,
      qty_available: 500,
      last_txn_at: new Date(),
    },
    {
      holder_type: 'OFFICE',
      holder_id: office._id,
      consumable_id: labOnlyItem._id,
      qty_on_hand: 500,
      qty_reserved: 0,
      qty_available: 500,
      last_txn_at: new Date(),
    },
  ]);
  await ConsumableInventoryBalanceModel.create([
    {
      holder_type: 'OFFICE',
      holder_id: office._id,
      consumable_item_id: generalItem._id,
      lot_id: generalLot._id,
      qty_on_hand_base: 500,
      qty_reserved_base: 0,
    },
    {
      holder_type: 'OFFICE',
      holder_id: office._id,
      consumable_item_id: labOnlyItem._id,
      lot_id: labLot._id,
      qty_on_hand_base: 500,
      qty_reserved_base: 0,
    },
  ]);
  const disposeReasonCode = await ConsumableReasonCodeModel.create({
    category: 'DISPOSE',
    code: 'EXPIRY',
    description: 'Expired stock',
    is_active: true,
  });

  const app = createApp();
  const makerAgent = request.agent(app);
  const officeHeadAgent = request.agent(app);
  const complianceAgent = request.agent(app);
  await login(makerAgent, 'cons-maker@example.com', 'Passw0rd!');
  await login(officeHeadAgent, 'cons-office-head@example.com', 'Passw0rd!');
  await login(complianceAgent, 'cons-compliance@example.com', 'Passw0rd!');

  const issueInitRes = await makerAgent.post('/api/consumables/issues').send({
    lot_id: labLot.id,
    to_type: 'OFFICE',
    to_id: office.id,
    quantity: 5,
    notes: 'Issue lab-only stock',
  });
  assert.equal(issueInitRes.status, 409, 'LAB_ONLY issue should require matrix approval');
  const issueApprovalId = String(
    issueInitRes.body?.details?.approval_request?.id
      || issueInitRes.body?.details?.approval_request?._id
      || ''
  );
  assert.ok(issueApprovalId, 'Issue approval request id should be present');

  const issueApproveHead = await officeHeadAgent
    .post(`/api/approval-matrix/${issueApprovalId}/decide`)
    .send({ decision: 'APPROVED' });
  assert.equal(issueApproveHead.status, 200);
  assert.equal(issueApproveHead.body?.status, 'Pending');

  const issueApproveCompliance = await complianceAgent
    .post(`/api/approval-matrix/${issueApprovalId}/decide`)
    .send({ decision: 'APPROVED' });
  assert.equal(issueApproveCompliance.status, 200);
  assert.equal(issueApproveCompliance.body?.status, 'Approved');

  const issueFinalRes = await makerAgent.post('/api/consumables/issues').send({
    lot_id: labLot.id,
    to_type: 'OFFICE',
    to_id: office.id,
    quantity: 5,
    approval_workflow_id: issueApprovalId,
    notes: 'Issue lab-only stock',
  });
  assert.equal(
    issueFinalRes.status,
    201,
    `Expected issue success after approval, got ${issueFinalRes.status}: ${JSON.stringify(issueFinalRes.body)}`
  );

  const issueWorkflow = await ApprovalMatrixRequestModel.findById(issueApprovalId).lean();
  assert.equal(String(issueWorkflow?.status || ''), 'Executed');

  const disposeInitRes = await makerAgent.post('/api/consumables/inventory/dispose').send({
    holderType: 'OFFICE',
    holderId: office.id,
    itemId: generalItem.id,
    lotId: generalLot.id,
    qty: 120,
    uom: 'EA',
    reasonCodeId: disposeReasonCode.id,
    notes: 'Large disposal',
  });
  assert.equal(disposeInitRes.status, 409, 'Large disposal should require matrix approval');
  let disposeApprovalId = String(
    disposeInitRes.body?.details?.approval_request?.id
      || disposeInitRes.body?.details?.approval_request?._id
      || ''
  );
  if (!disposeApprovalId) {
    const pendingDisposalRequest: any = await ApprovalMatrixRequestModel.findOne({
      transaction_type: 'CONSUMABLE_DISPOSAL',
      maker_user_id: maker._id,
      status: 'Pending',
    })
      .sort({ requested_at: -1 })
      .lean();
    disposeApprovalId = String(pendingDisposalRequest?._id || '');
  }
  assert.ok(disposeApprovalId, 'Disposal approval request id should be present');

  const disposeApproveHead = await officeHeadAgent
    .post(`/api/approval-matrix/${disposeApprovalId}/decide`)
    .send({ decision: 'APPROVED' });
  assert.equal(disposeApproveHead.status, 200);
  assert.equal(disposeApproveHead.body?.status, 'Pending');

  const disposeApproveCompliance = await complianceAgent
    .post(`/api/approval-matrix/${disposeApprovalId}/decide`)
    .send({ decision: 'APPROVED' });
  assert.equal(disposeApproveCompliance.status, 200);
  assert.equal(disposeApproveCompliance.body?.status, 'Approved');

  const disposeFinalRes = await makerAgent.post('/api/consumables/inventory/dispose').send({
    holderType: 'OFFICE',
    holderId: office.id,
    itemId: generalItem.id,
    lotId: generalLot.id,
    qty: 120,
    uom: 'EA',
    reasonCodeId: disposeReasonCode.id,
    approval_workflow_id: disposeApprovalId,
    notes: 'Large disposal',
  });
  assert.equal(
    disposeFinalRes.status,
    201,
    `Expected disposal success after approval, got ${disposeFinalRes.status}: ${JSON.stringify(disposeFinalRes.body)}`
  );

  const disposeWorkflow = await ApprovalMatrixRequestModel.findById(disposeApprovalId).lean();
  assert.equal(String(disposeWorkflow?.status || ''), 'Executed');

  await mongoose.disconnect();
  await mongo.stop();
  console.log('Consumables approval matrix runtime test passed.');
}

main().catch(async (error) => {
  console.error('Consumables approval matrix runtime test failed.');
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore cleanup errors
  }
  process.exit(1);
});
