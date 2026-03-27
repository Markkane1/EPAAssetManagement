import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import mongoose from 'mongoose';

const DB_NAME = 'ams_profile_codex';
const DB_URI = `mongodb://127.0.0.1:27018/${DB_NAME}?replicaSet=rs0`;

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

const oid = (value: unknown) =>
  value instanceof mongoose.Types.ObjectId ? value : new mongoose.Types.ObjectId(String(value));

const planStage = (plan: any): string =>
  !plan || typeof plan !== 'object'
    ? 'unknown'
    : plan.stage ||
      plan.queryPlan?.stage ||
      (plan.inputStage
        ? planStage(plan.inputStage)
        : plan.inputStages?.[0]
          ? planStage(plan.inputStages[0])
          : plan.winningPlan
            ? planStage(plan.winningPlan)
            : plan.queryPlanner?.winningPlan
              ? planStage(plan.queryPlanner.winningPlan)
              : 'unknown');

const planIndexName = (plan: any): string | null =>
  !plan || typeof plan !== 'object'
    ? null
    : plan.indexName ||
      (plan.inputStage
        ? planIndexName(plan.inputStage)
        : plan.inputStages?.[0]
          ? planIndexName(plan.inputStages[0])
          : plan.winningPlan
            ? planIndexName(plan.winningPlan)
            : plan.queryPlanner?.winningPlan
              ? planIndexName(plan.queryPlanner.winningPlan)
              : null);

function summarizeFindExplain(explain: any) {
  const executionStats = explain?.executionStats || {};
  const winningPlan = explain?.queryPlanner?.winningPlan || executionStats?.executionStages;
  return {
    stage: planStage(winningPlan),
    indexName: planIndexName(winningPlan),
    totalDocsExamined: executionStats.totalDocsExamined ?? null,
    totalKeysExamined: executionStats.totalKeysExamined ?? null,
    executionTimeMs: executionStats.executionTimeMillis ?? null,
  };
}

function summarizeAggregateExplain(explain: any) {
  const cursorStage = Array.isArray(explain?.stages)
    ? explain.stages.find((stage: any) => stage.$cursor)?.$cursor
    : null;
  const executionStats = cursorStage?.executionStats || explain?.executionStats || {};
  const winningPlan =
    cursorStage?.queryPlanner?.winningPlan ||
    explain?.queryPlanner?.winningPlan ||
    executionStats?.executionStages;

  return {
    stage: planStage(winningPlan),
    indexName: planIndexName(winningPlan),
    totalDocsExamined: executionStats.totalDocsExamined ?? null,
    totalKeysExamined: executionStats.totalKeysExamined ?? null,
    executionTimeMs: executionStats.executionTimeMillis ?? null,
  };
}

async function main() {
  await connectDatabase();
  const db = mongoose.connection.db;

  const officeA = await db.collection('offices').findOne(
    { name: 'District Office A' },
    { projection: { _id: 1 } }
  );
  const requisition = await db.collection('requisitions').findOne(
    { file_number: 'REQ-FULFILL-PERF-0001' },
    { projection: { _id: 1 } }
  );
  const employeeUser = await db.collection('users').findOne(
    { email: 'employee-a@test.example' },
    { projection: { _id: 1 } }
  );

  if (!officeA?._id || !requisition?._id || !employeeUser?._id) {
    throw new Error('Expected profiling seed data was not found in ams_profile_codex');
  }

  const notificationRows = await db
    .collection('notifications')
    .find(
      {},
      { projection: { recipient_user_id: 1, office_id: 1, type: 1, entity_type: 1, entity_id: 1 } }
    )
    .limit(20)
    .toArray();

  const dedupeOrFilters = notificationRows.map((row: any) => ({
    recipient_user_id: row.recipient_user_id,
    office_id: row.office_id,
    type: row.type,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
  }));

  const results = {
    database: DB_NAME,
    capturedAt: new Date().toISOString(),
    explainPlans: {
      notificationDedupe: summarizeFindExplain(
        await db
          .collection('notifications')
          .find(
            {
              created_at: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
              $or: dedupeOrFilters,
            },
            {
              projection: {
                recipient_user_id: 1,
                office_id: 1,
                type: 1,
                entity_type: 1,
                entity_id: 1,
                created_at: 1,
              },
            }
          )
          .explain('executionStats')
      ),
      dashboardScopedStats: summarizeAggregateExplain(
        await db
          .collection('assetitems')
          .aggregate([
            {
              $match: {
                holder_type: 'OFFICE',
                holder_id: oid(officeA._id),
                is_active: { $ne: false },
              },
            },
            {
              $facet: {
                assetIds: [{ $group: { _id: '$asset_id' } }],
                statusBuckets: [{ $group: { _id: { $ifNull: ['$item_status', 'Unknown'] }, count: { $sum: 1 } } }],
              },
            },
          ])
          .explain('executionStats')
      ),
      employeeUserLookup: summarizeFindExplain(
        await db
          .collection('employees')
          .find({ user_id: employeeUser._id })
          .limit(1)
          .explain('executionStats')
      ),
      requisitionList: summarizeFindExplain(
        await db
          .collection('requisitions')
          .find({
            office_id: oid(officeA._id),
            status: { $in: ['APPROVED', 'PARTIALLY_FULFILLED'] },
          })
          .sort({ created_at: -1 })
          .limit(50)
          .explain('executionStats')
      ),
      requisitionDetail: summarizeFindExplain(
        await db.collection('requisitions').find({ _id: oid(requisition._id) }).limit(1).explain('executionStats')
      ),
      requisitionDetailLines: summarizeFindExplain(
        await db
          .collection('requisitionlines')
          .find({ requisition_id: oid(requisition._id) })
          .sort({ created_at: 1 })
          .explain('executionStats')
      ),
      maintenanceReminderScheduledDate: summarizeFindExplain(
        await db
          .collection('maintenancerecords')
          .find({
            maintenance_status: 'Scheduled',
            is_active: { $ne: false },
            scheduled_date: {
              $ne: null,
              $lte: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
            },
          })
          .sort({ scheduled_date: 1, _id: 1 })
          .limit(500)
          .explain('executionStats')
      ),
    },
  };

  const outputPath = path.resolve(process.cwd(), 'docs', 'profile-backend-explains.json');
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
