import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
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
const metrics = require('../server/src/observability/metrics');
const maintenanceWorker = require('../server/src/services/maintenanceReminderWorker.service');
const thresholdWorker = require('../server/src/services/thresholdAlertWorker.service');

type SnapshotSeries = {
  name: string;
  labels: Record<string, string>;
  value?: number;
  count?: number;
  sum?: number;
};

function metricKey(series: SnapshotSeries) {
  return `${series.name}|${JSON.stringify(series.labels)}`;
}

function diffCounters(before: any[], after: any[]) {
  const beforeMap = new Map(before.filter((entry) => entry.name === 'db_queries_total').map((entry) => [metricKey(entry), entry.value]));
  return after
    .filter((entry) => entry.name === 'db_queries_total')
    .map((entry) => ({
      ...entry,
      delta: Number(entry.value || 0) - Number(beforeMap.get(metricKey(entry)) || 0),
    }))
    .filter((entry) => entry.delta > 0)
    .sort((left, right) => right.delta - left.delta);
}

function diffHistograms(before: any[], after: any[]) {
  const beforeMap = new Map(
    before.filter((entry) => entry.name === 'db_query_duration_ms').map((entry) => [metricKey(entry), entry])
  );
  return after
    .filter((entry) => entry.name === 'db_query_duration_ms')
    .map((entry) => {
      const previous = beforeMap.get(metricKey(entry));
      const deltaCount = Number(entry.count || 0) - Number(previous?.count || 0);
      const deltaSum = Number(entry.sum || 0) - Number(previous?.sum || 0);
      return {
        ...entry,
        deltaCount,
        deltaSum,
        averageMs: deltaCount > 0 ? Number((deltaSum / deltaCount).toFixed(2)) : 0,
      };
    })
    .filter((entry) => entry.deltaCount > 0)
    .sort((left, right) => right.deltaSum - left.deltaSum);
}

async function main() {
  const workerName = String(process.argv[2] || '').trim().toLowerCase();
  if (!workerName || !['maintenance', 'threshold'].includes(workerName)) {
    throw new Error('Usage: tsx scripts/profile-workers.ts <maintenance|threshold>');
  }

  await connectDatabase();

  const runWorker =
    workerName === 'maintenance'
      ? maintenanceWorker.runMaintenanceReminderWorker
      : thresholdWorker.runThresholdAlertWorker;

  const beforeNotificationCount = await mongoose.connection.db
    .collection('notifications')
    .countDocuments();
  const beforeMetrics = metrics.getMetricsSnapshot();

  const startedAt = performance.now();
  await runWorker();
  const durationMs = Math.round(performance.now() - startedAt);

  const afterNotificationCount = await mongoose.connection.db
    .collection('notifications')
    .countDocuments();
  const afterMetrics = metrics.getMetricsSnapshot();

  const results = {
    worker: workerName,
    database: DB_NAME,
    capturedAt: new Date().toISOString(),
    durationMs,
    notificationsInsertedDelta: afterNotificationCount - beforeNotificationCount,
    dbQueryCounters: diffCounters(beforeMetrics.counters, afterMetrics.counters),
    dbQueryDurations: diffHistograms(beforeMetrics.histograms, afterMetrics.histograms),
  };

  const outputPath = path.resolve(process.cwd(), 'docs', `profile-worker-${workerName}.json`);
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
