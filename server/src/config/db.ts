import mongoose from 'mongoose';
import { env } from './env';
import { recordDbQueryMetric } from '../observability/metrics';

let listenersBound = false;
let commandListenersBound = false;

const TRACKED_COMMANDS = new Set([
  'aggregate',
  'count',
  'countdocuments',
  'delete',
  'distinct',
  'find',
  'findandmodify',
  'insert',
  'update',
]);

function shouldLogConnectionLifecycle() {
  return env.nodeEnv !== 'test';
}

function bindConnectionListeners() {
  if (listenersBound) return;
  listenersBound = true;

  mongoose.connection.on('connected', () => {
    if (!shouldLogConnectionLifecycle()) return;
    // Keep lightweight connection state logs for operational diagnostics.
    console.log('[db] MongoDB connected');
  });

  mongoose.connection.on('disconnected', () => {
    if (!shouldLogConnectionLifecycle()) return;
    console.warn('[db] MongoDB disconnected');
  });

  mongoose.connection.on('error', (error) => {
    console.error('[db] MongoDB error', error);
  });
}

function extractCommandCollection(commandName: string, command: Record<string, unknown> | undefined) {
  if (!command || typeof command !== 'object') return 'unknown';
  const commandKey = commandName.toLowerCase();
  const value = command[commandKey];
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  if (typeof command.find === 'string') return command.find;
  if (typeof command.aggregate === 'string') return command.aggregate;
  if (typeof command.count === 'string') return command.count;
  if (typeof command.delete === 'string') return command.delete;
  if (typeof command.insert === 'string') return command.insert;
  if (typeof command.update === 'string') return command.update;
  return 'unknown';
}

function bindMongoCommandMetrics() {
  if (commandListenersBound) return;
  const client = mongoose.connection.getClient();
  if (!client) return;

  commandListenersBound = true;

  client.on('commandSucceeded', (event: any) => {
    const operation = String(event?.commandName || '').toLowerCase();
    if (!TRACKED_COMMANDS.has(operation)) return;
    const collection = extractCommandCollection(operation, event?.command);
    const durationMs = Number.isFinite(Number(event?.duration)) ? Number(event.duration) / 1_000 : 0;
    recordDbQueryMetric(operation, collection, 'ok', durationMs);
  });

  client.on('commandFailed', (event: any) => {
    const operation = String(event?.commandName || '').toLowerCase();
    if (!TRACKED_COMMANDS.has(operation)) return;
    const collection = extractCommandCollection(operation, event?.command);
    const durationMs = Number.isFinite(Number(event?.duration)) ? Number(event.duration) / 1_000 : 0;
    recordDbQueryMetric(operation, collection, 'error', durationMs);
  });
}

async function assertReplicaSetSupportRequired() {
  if (!env.mongoRequireReplicaSet) return;
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('[db] MongoDB database handle is unavailable after connect');
  }
  const hello = await db.admin().command({ hello: 1 });
  const setName = String((hello as { setName?: unknown }).setName || '').trim();
  const msg = String((hello as { msg?: unknown }).msg || '').trim().toLowerCase();
  const isMongos = msg === 'isdbgrid';
  if (!setName && !isMongos) {
    throw new Error(
      '[db] MongoDB transactions require a replica set or mongos. Configure a local single-node replica set and use a replica-set URI (example: mongodb://127.0.0.1:27017/ams?replicaSet=rs0).'
    );
  }
}

export async function connectDatabase(): Promise<void> {
  bindConnectionListeners();

  const connectOptions = {
    maxPoolSize: env.mongoMaxPoolSize,
    minPoolSize: env.mongoMinPoolSize,
    maxIdleTimeMS: env.mongoMaxIdleTimeMs,
    serverSelectionTimeoutMS: env.mongoServerSelectionTimeoutMs,
    socketTimeoutMS: env.mongoSocketTimeoutMs,
    connectTimeoutMS: env.mongoConnectTimeoutMs,
    heartbeatFrequencyMS: env.mongoHeartbeatFrequencyMs,
    retryWrites: env.mongoRetryWrites,
    retryReads: env.mongoRetryReads,
    monitorCommands: true,
    appName: `ams-api-${env.nodeEnv}`,
  };

  let attempt = 0;
  let lastError: unknown = null;
  while (attempt < env.mongoConnectRetries) {
    try {
      await mongoose.connect(env.mongoUri, connectOptions);
      await assertReplicaSetSupportRequired();
      bindMongoCommandMetrics();
      return;
    } catch (error) {
      if (mongoose.connection.readyState !== 0) {
        try {
          await mongoose.disconnect();
        } catch {
          // Ignore disconnect cleanup failures here; retry loop will surface the original connect error.
        }
      }
      lastError = error;
      attempt += 1;
      if (attempt >= env.mongoConnectRetries) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, env.mongoConnectRetryDelayMs));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Unable to connect to MongoDB');
}
