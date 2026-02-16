import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const cwd = process.cwd();
const runningFromWorkspaceRoot = fs.existsSync(path.resolve(cwd, 'server'));
const workspaceRoot = runningFromWorkspaceRoot ? cwd : path.resolve(cwd, '..');
const rootEnvPath = path.resolve(workspaceRoot, '.env');
const serverEnvPath = path.resolve(workspaceRoot, 'server', '.env');

let loadedAnyEnv = false;
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
  loadedAnyEnv = true;
}
if (fs.existsSync(serverEnvPath)) {
  // Server-local env can override root workspace env values when needed.
  dotenv.config({ path: serverEnvPath, override: true });
  loadedAnyEnv = true;
}
if (!loadedAnyEnv) {
  dotenv.config();
}

function assertSecret(name: string, value: string | undefined) {
  const normalized = (value || '').trim();
  if (!normalized) {
    throw new Error(`${name} is required`);
  }
  if (normalized === 'change-me' || normalized === 'Admin123!') {
    throw new Error(`${name} must not use default placeholder values`);
  }
  if (normalized.length < 32) {
    throw new Error(`${name} must be at least 32 characters`);
  }
  return normalized;
}

function parseOptionalUnixTimestamp(name: string, value: string | undefined): number | null {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive unix timestamp in seconds`);
  }
  return parsed;
}

function parsePositiveInt(name: string, value: string | undefined, fallback: number) {
  const normalized = String(value || '').trim();
  if (!normalized) return fallback;
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function parseBoolean(name: string, value: string | undefined, fallback: boolean) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

function parseTrustProxy(
  name: string,
  value: string | undefined,
  fallback: boolean | number | string
): boolean | number | string {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  if (/^\d+$/.test(normalized)) return Number.parseInt(normalized, 10);
  return String(value || '').trim();
}

function parseByteLimit(name: string, value: string | undefined, fallback: string) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (!/^\d+(b|kb|mb)?$/.test(normalized)) {
    throw new Error(`${name} must be a size string like 100kb or 2mb`);
  }
  return normalized;
}

function parseCompressionLevel(name: string, value: string | undefined, fallback: number) {
  const normalized = String(value || '').trim();
  if (!normalized) return fallback;
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 9) {
    throw new Error(`${name} must be an integer between 0 and 9`);
  }
  return parsed;
}

function parseRateLimitBackend(value: string | undefined) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'mongo' as const;
  if (normalized === 'mongo' || normalized === 'memory') {
    return normalized;
  }
  throw new Error('RATE_LIMIT_BACKEND must be one of: mongo, memory');
}

const nodeEnv = process.env.NODE_ENV || 'development';
const seedSuperAdmin = process.env.SEED_SUPER_ADMIN === 'true';
const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || '';
const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || '';

if (seedSuperAdmin) {
  if (!superAdminEmail.trim()) {
    throw new Error('SUPER_ADMIN_EMAIL is required when SEED_SUPER_ADMIN=true');
  }
  if (!superAdminPassword.trim()) {
    throw new Error('SUPER_ADMIN_PASSWORD is required when SEED_SUPER_ADMIN=true');
  }
  if (superAdminPassword === 'Admin123!') {
    throw new Error('SUPER_ADMIN_PASSWORD must not use the default value');
  }
}

export const env = {
  nodeEnv,
  port: Number(process.env.PORT || 5000),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ams',
  mongoMaxPoolSize: parsePositiveInt(
    'MONGO_MAX_POOL_SIZE',
    process.env.MONGO_MAX_POOL_SIZE,
    nodeEnv === 'production' ? 30 : 10
  ),
  mongoMinPoolSize: parsePositiveInt(
    'MONGO_MIN_POOL_SIZE',
    process.env.MONGO_MIN_POOL_SIZE,
    nodeEnv === 'production' ? 5 : 1
  ),
  mongoMaxIdleTimeMs: parsePositiveInt('MONGO_MAX_IDLE_TIME_MS', process.env.MONGO_MAX_IDLE_TIME_MS, 45_000),
  mongoServerSelectionTimeoutMs: parsePositiveInt(
    'MONGO_SERVER_SELECTION_TIMEOUT_MS',
    process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS,
    10_000
  ),
  mongoSocketTimeoutMs: parsePositiveInt('MONGO_SOCKET_TIMEOUT_MS', process.env.MONGO_SOCKET_TIMEOUT_MS, 60_000),
  mongoConnectTimeoutMs: parsePositiveInt(
    'MONGO_CONNECT_TIMEOUT_MS',
    process.env.MONGO_CONNECT_TIMEOUT_MS,
    10_000
  ),
  mongoHeartbeatFrequencyMs: parsePositiveInt(
    'MONGO_HEARTBEAT_FREQUENCY_MS',
    process.env.MONGO_HEARTBEAT_FREQUENCY_MS,
    10_000
  ),
  mongoConnectRetries: parsePositiveInt('MONGO_CONNECT_RETRIES', process.env.MONGO_CONNECT_RETRIES, 3),
  mongoConnectRetryDelayMs: parsePositiveInt(
    'MONGO_CONNECT_RETRY_DELAY_MS',
    process.env.MONGO_CONNECT_RETRY_DELAY_MS,
    1_000
  ),
  mongoRetryWrites: parseBoolean('MONGO_RETRY_WRITES', process.env.MONGO_RETRY_WRITES, true),
  mongoRetryReads: parseBoolean('MONGO_RETRY_READS', process.env.MONGO_RETRY_READS, true),
  jwtSecret: assertSecret('JWT_SECRET', process.env.JWT_SECRET),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  jwtInvalidateBefore: parseOptionalUnixTimestamp('JWT_INVALIDATE_BEFORE', process.env.JWT_INVALIDATE_BEFORE),
  passwordResetTokenTtlMinutes: parsePositiveInt(
    'PASSWORD_RESET_TOKEN_TTL_MINUTES',
    process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES,
    15
  ),
  authLockoutThreshold: parsePositiveInt('AUTH_LOCKOUT_THRESHOLD', process.env.AUTH_LOCKOUT_THRESHOLD, 5),
  authLockoutBaseMinutes: parsePositiveInt('AUTH_LOCKOUT_BASE_MINUTES', process.env.AUTH_LOCKOUT_BASE_MINUTES, 15),
  authLockoutMaxMinutes: parsePositiveInt('AUTH_LOCKOUT_MAX_MINUTES', process.env.AUTH_LOCKOUT_MAX_MINUTES, 120),
  trustProxy: parseTrustProxy('TRUST_PROXY', process.env.TRUST_PROXY, nodeEnv === 'production' ? 1 : false),
  compressionThresholdBytes: parsePositiveInt(
    'COMPRESSION_THRESHOLD_BYTES',
    process.env.COMPRESSION_THRESHOLD_BYTES,
    512
  ),
  compressionLevel: parseCompressionLevel('COMPRESSION_LEVEL', process.env.COMPRESSION_LEVEL, 6),
  httpJsonLimit: parseByteLimit('HTTP_JSON_LIMIT', process.env.HTTP_JSON_LIMIT, '1mb'),
  httpUrlEncodedLimit: parseByteLimit('HTTP_URLENCODED_LIMIT', process.env.HTTP_URLENCODED_LIMIT, '256kb'),
  cacheReferenceMaxAgeSeconds: parsePositiveInt(
    'CACHE_REFERENCE_MAX_AGE_SECONDS',
    process.env.CACHE_REFERENCE_MAX_AGE_SECONDS,
    60
  ),
  cacheReferenceStaleWhileRevalidateSeconds: parsePositiveInt(
    'CACHE_REFERENCE_STALE_WHILE_REVALIDATE_SECONDS',
    process.env.CACHE_REFERENCE_STALE_WHILE_REVALIDATE_SECONDS,
    120
  ),
  rateLimitBackend: parseRateLimitBackend(process.env.RATE_LIMIT_BACKEND),
  corsOrigin:
    process.env.CORS_ORIGIN
    || 'http://localhost:8080,http://127.0.0.1:8080,http://[::1]:8080,http://localhost:5173,http://127.0.0.1:5173,http://[::1]:5173',
  seedSuperAdmin,
  superAdminEmail,
  superAdminPassword,
};

if (env.mongoMinPoolSize > env.mongoMaxPoolSize) {
  throw new Error('MONGO_MIN_POOL_SIZE must be less than or equal to MONGO_MAX_POOL_SIZE');
}
