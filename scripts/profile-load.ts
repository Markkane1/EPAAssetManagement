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

type SampleResult = {
  label: string;
  status: number;
  runs: number;
  minMs: number;
  maxMs: number;
  averageMs: number;
  responseBytes: number;
};

async function login(agent: ReturnType<typeof request.agent>, email: string) {
  const response = await agent.post('/api/auth/login').send({ email, password: PASSWORD });
  if (response.status !== 200) {
    throw new Error(`Login failed for ${email}: ${response.status}`);
  }
}

async function sampleRequest(
  label: string,
  runs: number,
  execute: () => Promise<request.Response>
): Promise<SampleResult> {
  const durations: number[] = [];
  let lastStatus = 0;
  let lastBytes = 0;

  for (let index = 0; index < runs; index += 1) {
    const startedAt = performance.now();
    const response = await execute();
    const durationMs = Math.round(performance.now() - startedAt);
    durations.push(durationMs);
    lastStatus = response.status;
    lastBytes = Buffer.byteLength(JSON.stringify(response.body ?? null), 'utf8');
  }

  return {
    label,
    status: lastStatus,
    runs,
    minMs: Math.min(...durations),
    maxMs: Math.max(...durations),
    averageMs: Number((durations.reduce((sum, value) => sum + value, 0) / durations.length).toFixed(2)),
    responseBytes: lastBytes,
  };
}

async function buildFulfillmentPayload(requisitionId: mongoose.Types.ObjectId, officeId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db;
  const requisitionLines = await db
    .collection('requisitionlines')
    .find(
      { requisition_id: requisitionId },
      { projection: { _id: 1, line_type: 1, asset_id: 1 } }
    )
    .sort({ created_at: 1 })
    .toArray();

  const moveableAssetIds = Array.from(
    new Set(
      requisitionLines
        .filter((line: any) => line.line_type === 'MOVEABLE' && line.asset_id)
        .map((line: any) => String(line.asset_id))
    )
  );

  const moveableItems = await db
    .collection('assetitems')
    .find(
      {
        asset_id: { $in: moveableAssetIds.map((id) => new mongoose.Types.ObjectId(id)) },
        holder_type: 'OFFICE',
        holder_id: officeId,
        assignment_status: 'Unassigned',
        item_status: 'Available',
        is_active: { $ne: false },
      },
      { projection: { _id: 1, asset_id: 1 } }
    )
    .toArray();

  const moveableByAssetId = new Map<string, string[]>();
  moveableItems.forEach((item: any) => {
    const key = String(item.asset_id);
    const existing = moveableByAssetId.get(key) || [];
    if (existing.length < 2) {
      existing.push(String(item._id));
    }
    moveableByAssetId.set(key, existing);
  });

  return {
    lines: requisitionLines.map((line: any) => ({
      lineId: String(line._id),
      assignedAssetItemIds:
        line.line_type === 'MOVEABLE' ? moveableByAssetId.get(String(line.asset_id)) || [] : [],
      issuedQuantity: line.line_type === 'CONSUMABLE' ? 60 : null,
    })),
  };
}

async function main() {
  await connectDatabase();
  const app = createApp();
  const db = mongoose.connection.db;

  const officeA = await db.collection('offices').findOne(
    { name: 'District Office A' },
    { projection: { _id: 1 } }
  );
  const requisition = await db.collection('requisitions').findOne(
    { file_number: 'REQ-FULFILL-PERF-0001' },
    { projection: { _id: 1, status: 1 } }
  );

  if (!officeA?._id || !requisition?._id) {
    throw new Error('Expected profiling seed data was not found in ams_profile_codex');
  }

  const adminAgent = request.agent(app);
  const employeeAgent = request.agent(app);
  const officeHeadAgent = request.agent(app);

  await login(adminAgent, 'admin@test.example');
  await login(employeeAgent, 'employee-a@test.example');
  await login(officeHeadAgent, 'office-head-a@test.example');

  const results = {
    database: DB_NAME,
    capturedAt: new Date().toISOString(),
    dashboard50kAssetItems: await sampleRequest('dashboard50kAssetItems', 3, () =>
      officeHeadAgent.get('/api/dashboard/stats')
    ),
    employeeDashboardLargeEmployeeCollection: await sampleRequest(
      'employeeDashboardLargeEmployeeCollection',
      3,
      () => employeeAgent.get('/api/dashboard/me')
    ),
    requisitionList: await sampleRequest('requisitionList', 3, () =>
      adminAgent.get('/api/requisitions').query({ page: 1, limit: 50 })
    ),
    requisitionDetail: await sampleRequest('requisitionDetail', 3, () =>
      adminAgent.get(`/api/requisitions/${String(requisition._id)}`)
    ),
    requisitionFulfillmentManyLinesLots:
      String(requisition.status) === 'APPROVED' || String(requisition.status) === 'PARTIALLY_FULFILLED'
        ? (() => null)()
        : {
            label: 'requisitionFulfillmentManyLinesLots',
            skipped: true,
            reason: `Requisition status is ${String(requisition.status)}`,
          },
  } as Record<string, unknown>;

  if (String(requisition.status) === 'APPROVED' || String(requisition.status) === 'PARTIALLY_FULFILLED') {
    const payload = await buildFulfillmentPayload(requisition._id, officeA._id);
    const startedAt = performance.now();
    const response = await adminAgent.post(`/api/requisitions/${String(requisition._id)}/fulfill`).send(payload);
    const durationMs = Math.round(performance.now() - startedAt);
    results.requisitionFulfillmentManyLinesLots = {
      label: 'requisitionFulfillmentManyLinesLots',
      status: response.status,
      durationMs,
      responseBytes: Buffer.byteLength(JSON.stringify(response.body ?? null), 'utf8'),
    };
  }

  const outputPath = path.resolve(process.cwd(), 'docs', 'profile-load-results.json');
  await fs.writeFile(outputPath, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(results, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  process.exit(1);
});
