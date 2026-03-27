import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
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
const metrics = require('../server/src/observability/metrics');
const maintenanceWorker = require('../server/src/services/maintenanceReminderWorker.service');
const thresholdWorker = require('../server/src/services/thresholdAlertWorker.service');

const oid = (v: unknown) => (v instanceof mongoose.Types.ObjectId ? v : new mongoose.Types.ObjectId(String(v)));
const metricKey = (e: any) => `${e.name}|${JSON.stringify(e.labels)}`;
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
const diffCounters = (a: any[], b: any[]) => {
  const before = new Map(a.filter((e) => e.name === 'db_queries_total').map((e) => [metricKey(e), e.value]));
  return b.filter((e) => e.name === 'db_queries_total').map((e) => ({ ...e, delta: e.value - (before.get(metricKey(e)) || 0) })).filter((e) => e.delta).sort((l, r) => r.delta - l.delta);
};
const diffHists = (a: any[], b: any[]) => {
  const before = new Map(a.filter((e) => e.name === 'db_query_duration_ms').map((e) => [metricKey(e), e]));
  return b.filter((e) => e.name === 'db_query_duration_ms').map((e) => { const prev = before.get(metricKey(e)); return { ...e, deltaCount: e.count - (prev?.count || 0), deltaSum: e.sum - (prev?.sum || 0) }; }).filter((e) => e.deltaCount).sort((l, r) => r.deltaCount - l.deltaCount);
};

async function login(agent: ReturnType<typeof request.agent>, email: string) {
  const res = await agent.post('/api/auth/login').send({ email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.status}`);
}

async function main() {
  await connectDatabase();
  const app = createApp();
  const db = mongoose.connection.db;
  const officeA = await db.collection('offices').findOne({ name: 'District Office A' }, { projection: { _id: 1 } });
  const requisition = await db.collection('requisitions').findOne({ file_number: 'REQ-FULFILL-PERF-0001' }, { projection: { _id: 1 } });
  if (!officeA?._id || !requisition?._id) throw new Error('Expected profiling seed data was not found');

  const adminAgent = request.agent(app);
  const employeeAgent = request.agent(app);
  const officeHeadAgent = request.agent(app);
  await login(adminAgent, 'admin@test.example');
  await login(employeeAgent, 'employee-a@test.example');
  await login(officeHeadAgent, 'office-head-a@test.example');

  const notifRows = await db.collection('notifications').find({}, { projection: { recipient_user_id: 1, office_id: 1, type: 1, entity_type: 1, entity_id: 1 } }).limit(20).toArray();
  const notifFilter = notifRows.map((r: any) => ({ recipient_user_id: r.recipient_user_id, office_id: r.office_id, type: r.type, entity_type: r.entity_type, entity_id: r.entity_id }));

  const explains = {
    notificationDedupe: findSummary(await db.collection('notifications').find({ created_at: { $gte: new Date(Date.now() - 86400000) }, $or: notifFilter }, { projection: { recipient_user_id: 1, office_id: 1, type: 1, entity_type: 1, entity_id: 1, created_at: 1 } }).explain('executionStats')),
    dashboardScopedStats: aggSummary(await db.collection('assetitems').aggregate([{ $match: { holder_type: 'OFFICE', holder_id: oid(officeA._id), is_active: { $ne: false } } }, { $facet: { assetIds: [{ $group: { _id: '$asset_id' } }], statusBuckets: [{ $group: { _id: { $ifNull: ['$item_status', 'Unknown'] }, count: { $sum: 1 } } }] } }]).explain('executionStats')),
    employeeUserLookup: findSummary(await db.collection('employees').find({ user_id: (await db.collection('users').findOne({ email: 'employee-a@test.example' }, { projection: { _id: 1 } }))?._id }).limit(1).explain('executionStats')),
    requisitionList: findSummary(await db.collection('requisitions').find({ office_id: oid(officeA._id), status: { $in: ['APPROVED', 'PARTIALLY_FULFILLED'] } }).sort({ created_at: -1 }).limit(50).explain('executionStats')),
    requisitionDetail: findSummary(await db.collection('requisitions').find({ _id: oid(requisition._id) }).limit(1).explain('executionStats')),
    requisitionDetailLines: findSummary(await db.collection('requisitionlines').find({ requisition_id: oid(requisition._id) }).sort({ created_at: 1 }).explain('executionStats')),
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
  const g0 = performance.now(); const reqDetail = await adminAgent.get(`/api/requisitions/${requisition._id}`); const reqDetailMs = Math.round(performance.now() - g0);

  const reqLines = await db.collection('requisitionlines').find(
    { requisition_id: requisition._id },
    { projection: { _id: 1, line_type: 1, asset_id: 1 } }
  ).sort({ created_at: 1 }).toArray();
  const moveableAssetIds = Array.from(new Set(reqLines.filter((line: any) => line.line_type === 'MOVEABLE' && line.asset_id).map((line: any) => String(line.asset_id))));
  const moveableItems = await db.collection('assetitems').find(
    {
      asset_id: { $in: moveableAssetIds.map((id) => oid(id)) },
      holder_type: 'OFFICE',
      holder_id: oid(officeA._id),
      assignment_status: 'Unassigned',
      item_status: 'Available',
      is_active: { $ne: false },
    },
    { projection: { _id: 1, asset_id: 1 } }
  ).toArray();
  const moveableByAsset = new Map<string, string[]>();
  moveableItems.forEach((item: any) => {
    const key = String(item.asset_id);
    const list = moveableByAsset.get(key) || [];
    if (list.length < 2) list.push(String(item._id));
    moveableByAsset.set(key, list);
  });
  const fulfillPayload = {
    lines: reqLines.map((line: any) => ({
      lineId: String(line._id),
      assignedAssetItemIds: line.line_type === 'MOVEABLE' ? moveableByAsset.get(String(line.asset_id)) || [] : [],
      issuedQuantity: line.line_type === 'CONSUMABLE' ? 60 : null,
    })),
  };
  const f0 = performance.now(); const fulfill = await adminAgent.post(`/api/requisitions/${requisition._id}/fulfill`).send(fulfillPayload); const fulfillMs = Math.round(performance.now() - f0);

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
      requisitionFulfillmentManyLinesLots: { status: fulfill.status, durationMs: fulfillMs, body: fulfill.body },
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
