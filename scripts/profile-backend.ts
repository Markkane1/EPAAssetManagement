import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';

const DB_NAME = 'ams_profile_codex';
const DB_URI = `mongodb://127.0.0.1:27018/${DB_NAME}?replicaSet=rs0`;
const PASSWORD = 'Passw0rd!2026';

process.env.NODE_ENV = 'test';
process.env.LOAD_DOTENV_IN_TEST = 'false';
process.env.MONGO_URI = DB_URI;
process.env.MONGO_REQUIRE_REPLICA_SET = 'true';
process.env.JWT_SECRET = '0123456789abcdef0123456789abcdef';
process.env.CORS_ORIGIN = 'http://localhost:5173,http://localhost:8081';
process.env.JWT_EXPIRES_IN = '7d';
process.env.SEED_SUPER_ADMIN = 'false';
process.env.RATE_LIMIT_BACKEND = 'mongo';

const require = createRequire(import.meta.url);
const { connectDatabase } = require('../server/src/config/db');
const { createApp } = require('../server/src/app');
const { UserModel } = require('../server/src/models/user.model');
const { OfficeModel } = require('../server/src/models/office.model');
const { EmployeeModel } = require('../server/src/models/employee.model');
const metrics = require('../server/src/observability/metrics');
const maintenanceWorker = require('../server/src/services/maintenanceReminderWorker.service');
const thresholdWorker = require('../server/src/services/thresholdAlertWorker.service');

const oid = (v?: unknown) => (v instanceof mongoose.Types.ObjectId ? v : new mongoose.Types.ObjectId(String(v)));
const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();
const chunkedInsert = async (c: mongoose.mongo.Collection, docs: Record<string, unknown>[], size = 1000) => {
  for (let i = 0; i < docs.length; i += size) await c.insertMany(docs.slice(i, i + size), { ordered: false });
};
const metricKey = (e: any) => `${e.name}|${JSON.stringify(e.labels)}`;
const diffCounters = (a: any[], b: any[]) => {
  const before = new Map(a.filter((e) => e.name === 'db_queries_total').map((e) => [metricKey(e), e.value]));
  return b
    .filter((e) => e.name === 'db_queries_total')
    .map((e) => ({ ...e, delta: e.value - (before.get(metricKey(e)) || 0) }))
    .filter((e) => e.delta)
    .sort((l, r) => r.delta - l.delta);
};
const diffHists = (a: any[], b: any[]) => {
  const before = new Map(a.filter((e) => e.name === 'db_query_duration_ms').map((e) => [metricKey(e), e]));
  return b
    .filter((e) => e.name === 'db_query_duration_ms')
    .map((e) => {
      const prev = before.get(metricKey(e));
      return { ...e, deltaCount: e.count - (prev?.count || 0), deltaSum: e.sum - (prev?.sum || 0) };
    })
    .filter((e) => e.deltaCount)
    .sort((l, r) => r.deltaCount - l.deltaCount);
};
const stage = (p: any): string =>
  !p || typeof p !== 'object'
    ? 'unknown'
    : p.stage || p.queryPlan?.stage || (p.inputStage ? stage(p.inputStage) : p.inputStages?.[0] ? stage(p.inputStages[0]) : p.winningPlan ? stage(p.winningPlan) : p.queryPlanner?.winningPlan ? stage(p.queryPlanner.winningPlan) : 'unknown');
const indexName = (p: any): string | null =>
  !p || typeof p !== 'object'
    ? null
    : p.indexName || (p.inputStage ? indexName(p.inputStage) : p.inputStages?.[0] ? indexName(p.inputStages[0]) : p.winningPlan ? indexName(p.winningPlan) : p.queryPlanner?.winningPlan ? indexName(p.queryPlanner.winningPlan) : null);
const findSummary = (e: any) => {
  const s = e?.executionStats || {};
  const p = e?.queryPlanner?.winningPlan || s?.executionStages;
  return { stage: stage(p), indexName: indexName(p), totalDocsExamined: s.totalDocsExamined ?? null, totalKeysExamined: s.totalKeysExamined ?? null, executionTimeMs: s.executionTimeMillis ?? null };
};
const aggSummary = (e: any) => {
  const c = Array.isArray(e?.stages) ? e.stages.find((x: any) => x.$cursor)?.$cursor : null;
  const s = c?.executionStats || e?.executionStats || {};
  const p = c?.queryPlanner?.winningPlan || e?.queryPlanner?.winningPlan || s?.executionStages;
  return { stage: stage(p), indexName: indexName(p), totalDocsExamined: s.totalDocsExamined ?? null, totalKeysExamined: s.totalKeysExamined ?? null, executionTimeMs: s.executionTimeMillis ?? null };
};

async function login(agent: ReturnType<typeof request.agent>, email: string) {
  const res = await agent.post('/api/auth/login').send({ email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.status}`);
}

async function bootstrap() {
  await connectDatabase();
  await mongoose.connection.db.dropDatabase();
  const app = createApp();
  const hash = await bcrypt.hash(PASSWORD, 10);
  const [head, officeA, officeB] = await Promise.all([
    OfficeModel.create({ name: 'Central Store', type: 'HEAD_OFFICE', is_active: true }),
    OfficeModel.create({ name: 'District Office A', type: 'DISTRICT_OFFICE', is_active: true }),
    OfficeModel.create({ name: 'District Office B', type: 'DISTRICT_OFFICE', is_active: true }),
  ]);
  const [admin, officeHeadA, officeHeadB, caretakerA, employeeA, employeeB] = await Promise.all([
    UserModel.create({ email: 'admin@test.example', password_hash: hash, role: 'org_admin', roles: ['org_admin'], active_role: 'org_admin', first_name: 'Admin', last_name: 'User' }),
    UserModel.create({ email: 'office-head-a@test.example', password_hash: hash, role: 'office_head', roles: ['office_head'], active_role: 'office_head', first_name: 'Office', last_name: 'HeadA', location_id: officeA.id }),
    UserModel.create({ email: 'office-head-b@test.example', password_hash: hash, role: 'office_head', roles: ['office_head'], active_role: 'office_head', first_name: 'Office', last_name: 'HeadB', location_id: officeB.id }),
    UserModel.create({ email: 'caretaker-a@test.example', password_hash: hash, role: 'caretaker', roles: ['caretaker'], active_role: 'caretaker', first_name: 'Care', last_name: 'TakerA', location_id: officeA.id }),
    UserModel.create({ email: 'employee-a@test.example', password_hash: hash, role: 'employee', roles: ['employee'], active_role: 'employee', first_name: 'Employee', last_name: 'A', location_id: officeA.id }),
    UserModel.create({ email: 'employee-b@test.example', password_hash: hash, role: 'employee', roles: ['employee'], active_role: 'employee', first_name: 'Employee', last_name: 'B', location_id: officeB.id }),
  ]);
  const [empA, empB] = await Promise.all([
    EmployeeModel.create({ user_id: employeeA.id, email: employeeA.email, first_name: 'Employee', last_name: 'A', location_id: officeA.id, is_active: true }),
    EmployeeModel.create({ user_id: employeeB.id, email: employeeB.email, first_name: 'Employee', last_name: 'B', location_id: officeB.id, is_active: true }),
  ]);
  return { app, head, officeA, officeB, admin, officeHeadA, officeHeadB, caretakerA, employeeA, employeeB, empA, empB };
}

async function seedPerf(ctx: any) {
  const db = mongoose.connection.db;
  const now = new Date();
  const cols = {
    offices: db.collection('offices'),
    users: db.collection('users'),
    employees: db.collection('employees'),
    assets: db.collection('assets'),
    assetitems: db.collection('assetitems'),
    assignments: db.collection('assignments'),
    maint: db.collection('maintenancerecords'),
    notif: db.collection('notifications'),
    req: db.collection('requisitions'),
    reqLines: db.collection('requisitionlines'),
    returns: db.collection('returnrequests'),
    rooms: db.collection('officesublocations'),
    consItems: db.collection('consumableitems'),
    consBalances: db.collection('consumableinventorybalances'),
    consTx: db.collection('consumableinventorytransactions'),
    consLots: db.collection('consumablelots'),
  };

  const extraOffices: mongoose.Types.ObjectId[] = [];
  const extraOfficeDocs: Record<string, unknown>[] = [];
  const extraHeadUsers: Record<string, unknown>[] = [];
  const hash = await bcrypt.hash(PASSWORD, 10);
  for (let i = 0; i < 39; i += 1) {
    const officeId = new mongoose.Types.ObjectId();
    extraOffices.push(officeId);
    extraOfficeDocs.push({ _id: officeId, name: `Perf Office ${i + 1}`, code: `PO-${i + 1}`, type: 'DISTRICT_OFFICE', division: 'Perf', district: `D${i + 1}`, is_active: true, created_at: now, updated_at: now });
    extraHeadUsers.push({ _id: new mongoose.Types.ObjectId(), email: `perf-office-head-${i + 1}@test.example`, password_hash: hash, first_name: 'Perf', last_name: `Head${i + 1}`, role: 'office_head', roles: ['office_head'], active_role: 'office_head', location_id: officeId, is_active: true, token_version: 0, failed_login_attempts: 0, created_at: now, updated_at: now });
  }
  await chunkedInsert(cols.offices, extraOfficeDocs);
  await chunkedInsert(cols.users, extraHeadUsers);

  const extraEmployees: Record<string, unknown>[] = [];
  for (let i = 0; i < 12000; i += 1) extraEmployees.push({ _id: new mongoose.Types.ObjectId(), first_name: 'Perf', last_name: `Employee${i + 1}`, email: `perf-employee-${i + 1}@test.example`, user_id: null, location_id: oid(ctx.officeA._id), directorate_id: oid(ctx.head._id), is_active: true, created_at: now, updated_at: now });
  await chunkedInsert(cols.employees, extraEmployees, 2000);

  const assetIds: mongoose.Types.ObjectId[] = [];
  const availableByAsset = new Map<string, mongoose.Types.ObjectId[]>();
  const availableAll: mongoose.Types.ObjectId[] = [];
  const assets: Record<string, unknown>[] = [];
  const items: Record<string, unknown>[] = [];
  for (let a = 0; a < 5000; a += 1) {
    const assetId = new mongoose.Types.ObjectId();
    assetIds.push(assetId);
    assets.push({ _id: assetId, name: `Perf Asset ${a + 1}`, quantity: 10, unit_price: 500 + a, is_active: true, created_at: new Date(now.getTime() - a * 1000), updated_at: now });
    for (let i = 0; i < 10; i += 1) {
      const id = new mongoose.Types.ObjectId();
      const n = a * 10 + i;
      const status = n % 8 === 0 ? 'Maintenance' : n % 5 === 0 ? 'Assigned' : 'Available';
      const holder = n % 11 === 0 ? oid(ctx.officeB._id) : oid(ctx.officeA._id);
      items.push({ _id: id, asset_id: assetId, holder_type: 'OFFICE', holder_id: holder, serial_number: `SN-${n + 1}`, tag: `TAG-${n + 1}`, assignment_status: status === 'Assigned' ? 'Assigned' : 'Unassigned', item_status: status, item_condition: 'Good', functional_status: 'Functional', item_source: 'Purchased', is_active: true, warranty_expiry: n % 17 === 0 ? new Date(Date.now() + ((n % 25) - 5) * 86400000) : null, created_at: new Date(now.getTime() - n * 250), updated_at: now });
      if (String(holder) === String(ctx.officeA._id) && status === 'Available' && availableAll.length < 900) {
        availableAll.push(id);
        const list = availableByAsset.get(String(assetId)) || [];
        list.push(id);
        availableByAsset.set(String(assetId), list);
      }
    }
  }
  await chunkedInsert(cols.assets, assets, 1000);
  await chunkedInsert(cols.assetitems, items, 2000);

  const assigns: Record<string, unknown>[] = [];
  for (let i = 0; i < 250; i += 1) assigns.push({ _id: new mongoose.Types.ObjectId(), asset_item_id: availableAll[i + 200], status: 'ISSUED', assigned_to_type: 'EMPLOYEE', assigned_to_id: oid(ctx.empA._id), employee_id: oid(ctx.empA._id), requisition_id: new mongoose.Types.ObjectId(), requisition_line_id: new mongoose.Types.ObjectId(), issued_by_user_id: oid(ctx.admin._id), issued_at: new Date(now.getTime() - i * 60000), assigned_date: new Date(now.getTime() - i * 60000), notes: `Perf dashboard assignment ${i + 1}`, is_active: true, created_at: new Date(now.getTime() - i * 60000), updated_at: now });
  await chunkedInsert(cols.assignments, assigns, 500);

  const maint: Record<string, unknown>[] = [];
  for (let i = 0; i < 5000; i += 1) maint.push({ _id: new mongoose.Types.ObjectId(), asset_item_id: items[i]._id, maintenance_type: 'Preventive', maintenance_status: 'Scheduled', description: `Perf maintenance ${i + 1}`, scheduled_date: new Date(Date.now() + ((i % 6) - 2) * 86400000), performed_by: i % 2 === 0 ? 'Perf Vendor' : 'Perf Team', is_active: true, created_at: new Date(now.getTime() - i * 10000), updated_at: now });
  await chunkedInsert(cols.maint, maint, 1000);

  const notifRows = Array.from({ length: 250 }, (_, i) => ({ _id: new mongoose.Types.ObjectId(), recipient_user_id: oid(ctx.officeHeadA._id), office_id: oid(ctx.officeA._id), type: i % 2 === 0 ? 'MAINTENANCE_DUE' : 'WARRANTY_EXPIRY_ALERT', title: 'Perf Notification', message: 'Existing dedupe row', entity_type: i % 2 === 0 ? 'MaintenanceRecord' : 'AssetItem', entity_id: new mongoose.Types.ObjectId(), is_read: false, created_at: new Date(Date.now() - 7200000), updated_at: now }));
  await chunkedInsert(cols.notif, notifRows, 500);

  const reqDocs: Record<string, unknown>[] = [];
  for (let i = 0; i < 400; i += 1) reqDocs.push({ _id: new mongoose.Types.ObjectId(), file_number: `REQ-PERF-${String(i + 1).padStart(4, '0')}`, office_id: oid(ctx.officeA._id), issuing_office_id: oid(ctx.officeA._id), requested_by_employee_id: oid(ctx.empA._id), target_type: 'EMPLOYEE', target_id: oid(ctx.empA._id), linked_sub_location_id: null, submitted_by_user_id: oid(ctx.employeeA._id), status: i % 7 === 0 ? 'PARTIALLY_FULFILLED' : 'APPROVED', remarks: null, created_at: new Date(now.getTime() - i * 120000), updated_at: now });
  await chunkedInsert(cols.req, reqDocs, 500);

  const reqId = new mongoose.Types.ObjectId();
  await cols.req.insertOne({ _id: reqId, file_number: 'REQ-FULFILL-PERF-0001', office_id: oid(ctx.officeA._id), issuing_office_id: oid(ctx.officeA._id), requested_by_employee_id: oid(ctx.empA._id), target_type: 'EMPLOYEE', target_id: oid(ctx.empA._id), linked_sub_location_id: null, submitted_by_user_id: oid(ctx.employeeA._id), status: 'APPROVED', remarks: 'Performance fulfillment scenario', created_at: now, updated_at: now });
  const roomId = new mongoose.Types.ObjectId();
  await cols.rooms.insertOne({ _id: roomId, office_id: oid(ctx.officeA._id), name: 'Perf Room 1', is_active: true, created_at: now, updated_at: now });
  await cols.employees.updateOne({ _id: oid(ctx.empA._id) }, { $set: { default_sub_location_id: roomId, allowed_sub_location_ids: [roomId] } });

  const consItemId = new mongoose.Types.ObjectId();
  await cols.consItems.insertOne({ _id: consItemId, name: 'Perf Consumable', base_uom: 'EA', requires_lot_tracking: true, requires_container_tracking: false, default_min_stock: 50, default_reorder_point: 50, created_by: oid(ctx.admin._id), created_at: now, updated_at: now });

  const reqLines: Record<string, unknown>[] = [];
  const fulfillLines: Record<string, unknown>[] = [];
  for (let i = 0; i < 60; i += 1) {
    const lineId = new mongoose.Types.ObjectId();
    reqLines.push({ _id: lineId, requisition_id: reqId, line_type: 'MOVEABLE', asset_id: assetIds[i], consumable_id: null, requested_name: `Moveable ${i + 1}`, mapped_name: `Perf Asset ${i + 1}`, mapped_by_user_id: oid(ctx.admin._id), mapped_at: now, requested_quantity: 2, approved_quantity: 2, fulfilled_quantity: 0, status: 'PENDING_ASSIGNMENT', created_at: new Date(now.getTime() - i * 5000), updated_at: now });
    fulfillLines.push({ lineId: String(lineId), assignedAssetItemIds: (availableByAsset.get(String(assetIds[i])) || []).slice(0, 2).map(String), issuedQuantity: null });
  }
  for (let i = 0; i < 20; i += 1) {
    const lineId = new mongoose.Types.ObjectId();
    reqLines.push({ _id: lineId, requisition_id: reqId, line_type: 'CONSUMABLE', asset_id: null, consumable_id: consItemId, requested_name: `Consumable ${i + 1}`, mapped_name: 'Perf Consumable', mapped_by_user_id: oid(ctx.admin._id), mapped_at: now, requested_quantity: 60, approved_quantity: 60, fulfilled_quantity: 0, status: 'PENDING_ASSIGNMENT', created_at: new Date(now.getTime() - (i + 60) * 5000), updated_at: now });
    fulfillLines.push({ lineId: String(lineId), assignedAssetItemIds: [], issuedQuantity: 60 });
  }
  await chunkedInsert(cols.reqLines, reqLines, 500);

  const lots: Record<string, unknown>[] = [];
  const balances: Record<string, unknown>[] = [];
  for (let i = 0; i < 1500; i += 1) {
    const lotId = new mongoose.Types.ObjectId();
    lots.push({ _id: lotId, consumable_item_id: consItemId, lot_number: `LOT-${i + 1}`, received_date: iso(-i * 60000), expiry_date: iso((i + 1) * 86400000), created_at: new Date(now.getTime() - i * 60000), updated_at: now });
    balances.push({ _id: new mongoose.Types.ObjectId(), holder_type: 'OFFICE', holder_id: oid(ctx.officeA._id), consumable_item_id: consItemId, lot_id: lotId, qty_on_hand_base: 2, qty_reserved_base: 0, created_at: new Date(now.getTime() - i * 60000), updated_at: now });
  }
  const lowStockOffices = [oid(ctx.officeA._id), oid(ctx.officeB._id), ...extraOffices];
  for (let i = 1; i < lowStockOffices.length; i += 1) {
    const itemId = new mongoose.Types.ObjectId();
    await cols.consItems.insertOne({ _id: itemId, name: `Low Stock Perf Item ${i + 1}`, base_uom: 'EA', requires_lot_tracking: true, requires_container_tracking: false, default_min_stock: 10, default_reorder_point: 10, created_by: oid(ctx.admin._id), created_at: now, updated_at: now });
    balances.push({ _id: new mongoose.Types.ObjectId(), holder_type: 'OFFICE', holder_id: lowStockOffices[i], consumable_item_id: itemId, lot_id: null, qty_on_hand_base: 4, qty_reserved_base: 0, created_at: now, updated_at: now });
  }
  await chunkedInsert(cols.consLots, lots, 1000);
  await chunkedInsert(cols.consBalances, balances, 1000);

  const tx: Record<string, unknown>[] = [];
  for (let i = 0; i < 3000; i += 1) tx.push({ _id: new mongoose.Types.ObjectId(), tx_type: i % 2 === 0 ? 'OPENING_BALANCE' : 'CONSUME', tx_time: iso(-i * 120000), created_by: oid(ctx.admin._id), from_holder_type: i % 2 === 0 ? null : 'OFFICE', from_holder_id: i % 2 === 0 ? null : oid(ctx.officeA._id), to_holder_type: 'OFFICE', to_holder_id: oid(ctx.officeA._id), consumable_item_id: consItemId, lot_id: lots[i % lots.length]._id, qty_base: 1, entered_qty: 1, entered_uom: 'EA', reference: `TX-${i + 1}`, notes: 'Perf ledger row', metadata: {}, created_at: new Date(now.getTime() - i * 120000), updated_at: now });
  await chunkedInsert(cols.consTx, tx, 1000);
  await cols.returns.insertOne({ _id: new mongoose.Types.ObjectId(), employee_id: oid(ctx.empA._id), office_id: oid(ctx.officeA._id), status: 'SUBMITTED', lines: [{ asset_item_id: availableAll[0] }], created_at: now, updated_at: now });

  return { reqId: String(reqId), officeAId: String(ctx.officeA._id), notifFilter: notifRows.slice(0, 20).map((r) => ({ recipient_user_id: r.recipient_user_id, office_id: r.office_id, type: r.type, entity_type: r.entity_type, entity_id: r.entity_id })), fulfillPayload: { lines: fulfillLines } };
}

async function main() {
  const ctx = await bootstrap();
  const perf = await seedPerf(ctx);
  const [adminAgent, employeeAgent, officeHeadAgent] = [request.agent(ctx.app), request.agent(ctx.app), request.agent(ctx.app)];
  await login(adminAgent, ctx.admin.email);
  await login(employeeAgent, ctx.employeeA.email);
  await login(officeHeadAgent, ctx.officeHeadA.email);

  const db = mongoose.connection.db;
  const explains = {
    notificationDedupe: findSummary(await db.collection('notifications').find({ created_at: { $gte: new Date(Date.now() - 86400000) }, $or: perf.notifFilter }, { projection: { recipient_user_id: 1, office_id: 1, type: 1, entity_type: 1, entity_id: 1, created_at: 1 } }).explain('executionStats')),
    dashboardScopedStats: aggSummary(await db.collection('assetitems').aggregate([{ $match: { holder_type: 'OFFICE', holder_id: oid(perf.officeAId), is_active: { $ne: false } } }, { $facet: { assetIds: [{ $group: { _id: '$asset_id' } }], statusBuckets: [{ $group: { _id: { $ifNull: ['$item_status', 'Unknown'] }, count: { $sum: 1 } } }] } }]).explain('executionStats')),
    employeeUserLookup: findSummary(await db.collection('employees').find({ user_id: oid(ctx.employeeA._id) }, { projection: { _id: 1 } }).limit(1).explain('executionStats')),
    requisitionList: findSummary(await db.collection('requisitions').find({ office_id: oid(perf.officeAId), status: { $in: ['APPROVED', 'PARTIALLY_FULFILLED'] } }).sort({ created_at: -1 }).limit(50).explain('executionStats')),
    requisitionDetail: findSummary(await db.collection('requisitions').find({ _id: oid(perf.reqId) }).limit(1).explain('executionStats')),
    requisitionDetailLines: findSummary(await db.collection('requisitionlines').find({ requisition_id: oid(perf.reqId) }).sort({ created_at: 1 }).explain('executionStats')),
    maintenanceReminderScheduledDate: findSummary(await db.collection('maintenancerecords').find({ maintenance_status: 'Scheduled', is_active: { $ne: false }, scheduled_date: { $ne: null, $lte: new Date(Date.now() + 3 * 86400000) } }).sort({ scheduled_date: 1, _id: 1 }).limit(500).explain('executionStats')),
  };

  const m0 = metrics.getMetricsSnapshot();
  const t0 = performance.now(); await maintenanceWorker.runMaintenanceReminderWorker(); const maintenanceMs = Math.round(performance.now() - t0);
  const m1 = metrics.getMetricsSnapshot();
  const t1 = performance.now(); await thresholdWorker.runThresholdAlertWorker(); const thresholdMs = Math.round(performance.now() - t1);
  const m2 = metrics.getMetricsSnapshot();

  const d0 = performance.now(); const dashboard = await officeHeadAgent.get('/api/dashboard/stats'); const dashboardMs = Math.round(performance.now() - d0);
  const e0 = performance.now(); const employeeDash = await employeeAgent.get('/api/dashboard/me'); const employeeDashMs = Math.round(performance.now() - e0);
  const l0 = performance.now(); const reqList = await adminAgent.get('/api/requisitions').query({ limit: 50, page: 1 }); const reqListMs = Math.round(performance.now() - l0);
  const g0 = performance.now(); const reqDetail = await adminAgent.get(`/api/requisitions/${perf.reqId}`); const reqDetailMs = Math.round(performance.now() - g0);
  const f0 = performance.now(); const fulfill = await adminAgent.post(`/api/requisitions/${perf.reqId}/fulfill`).send(perf.fulfillPayload); const fulfillMs = Math.round(performance.now() - f0);

  const results = {
    database: { name: DB_NAME, uri: DB_URI },
    explainPlans: explains,
    workers: {
      maintenanceReminder: { durationMs: maintenanceMs, dbCounters: diffCounters(m0.counters, m1.counters), dbHistograms: diffHists(m0.histograms, m1.histograms) },
      thresholdAlert: { durationMs: thresholdMs, dbCounters: diffCounters(m1.counters, m2.counters), dbHistograms: diffHists(m1.histograms, m2.histograms) },
    },
    loadTests: {
      dashboard50kAssetItems: { status: dashboard.status, durationMs: dashboardMs, response: dashboard.body },
      employeeDashboardLargeEmployeeCollection: { status: employeeDash.status, durationMs: employeeDashMs, response: employeeDash.body },
      requisitionList: { status: reqList.status, durationMs: reqListMs, total: reqList.body?.total ?? null },
      requisitionDetail: { status: reqDetail.status, durationMs: reqDetailMs, lineCount: Array.isArray(reqDetail.body?.lines) ? reqDetail.body.lines.length : null },
      requisitionFulfillmentManyLinesLots: { status: fulfill.status, durationMs: fulfillMs, assignmentCount: Array.isArray(fulfill.body?.assignments) ? fulfill.body.assignments.length : null, consumableTransactionCount: Array.isArray(fulfill.body?.consumableTransactions) ? fulfill.body.consumableTransactions.length : null, body: fulfill.status >= 400 ? fulfill.body : undefined },
    },
  };
  await fs.writeFile(path.resolve(process.cwd(), 'docs', 'profile-backend-results.json'), `${JSON.stringify(results, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(results, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  process.exit(1);
});
