import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

function readCookieValue(setCookie: string[] | undefined, cookieName: string) {
  for (const entry of setCookie || []) {
    const [pair] = entry.split(';');
    if (!pair) continue;
    const separator = pair.indexOf('=');
    if (separator < 0) continue;
    const name = pair.slice(0, separator).trim();
    if (name !== cookieName) continue;
    return decodeURIComponent(pair.slice(separator + 1));
  }
  return null;
}

async function main() {
  const mongo = await MongoMemoryServer.create();
  process.env.NODE_ENV = 'test';
  process.env.LOAD_DOTENV_IN_TEST = 'false';
  process.env.MONGO_URI = mongo.getUri();
  process.env.JWT_SECRET = 'fedcba9876543210fedcba9876543210';
  process.env.CORS_ORIGIN = 'http://localhost:5173';
  process.env.JWT_EXPIRES_IN = '7d';
  process.env.SEED_SUPER_ADMIN = 'false';
  process.env.MONGO_REQUIRE_REPLICA_SET = 'false';
  process.env.RATE_LIMIT_BACKEND = 'memory';
  process.env.AUTH_LOCKOUT_THRESHOLD = '100';
  process.env.AUTH_LOCKOUT_BASE_MINUTES = '1';
  process.env.AUTH_LOCKOUT_MAX_MINUTES = '1';

  const { env } = await import('../../server/src/config/env');
  env.nodeEnv = 'production' as typeof env.nodeEnv;
  env.mongoUri = mongo.getUri();
  env.jwtSecret = 'fedcba9876543210fedcba9876543210';
  env.corsOrigin = 'http://localhost:5173';
  env.jwtExpiresIn = '7d';
  env.mongoRequireReplicaSet = false;
  env.rateLimitBackend = 'memory';
  env.authLockoutThreshold = 100;
  env.authLockoutBaseMinutes = 1;
  env.authLockoutMaxMinutes = 1;

  const { connectDatabase } = await import('../../server/src/config/db');
  const { createApp } = await import('../../server/src/app');
  const { UserModel } = await import('../../server/src/models/user.model');

  await connectDatabase();
  const app = createApp();

  const passwordHash = await bcrypt.hash('Passw0rd!2026', 10);
  await UserModel.create({
    email: 'admin@test.example',
    password_hash: passwordHash,
    role: 'org_admin',
    roles: ['org_admin'],
    active_role: 'org_admin',
    first_name: 'Admin',
    last_name: 'User',
  });
  await UserModel.create({
    email: 'admin2@test.example',
    password_hash: passwordHash,
    role: 'org_admin',
    roles: ['org_admin'],
    active_role: 'org_admin',
    first_name: 'Admin',
    last_name: 'UserTwo',
  });

  const healthRes = await request(app).get('/health');
  assert.equal(healthRes.status, 200, 'Health check must succeed');
  assert.ok(healthRes.headers['strict-transport-security'], 'HSTS header must be present in production');
  assert.ok(healthRes.headers['content-security-policy'], 'CSP header must be present');
  assert.equal(healthRes.headers['x-content-type-options'], 'nosniff', 'X-Content-Type-Options must be nosniff');
  assert.ok(['DENY', 'SAMEORIGIN'].includes(String(healthRes.headers['x-frame-options']).toUpperCase()), 'X-Frame-Options must deny framing');
  assert.equal(healthRes.headers['x-powered-by'], undefined, 'X-Powered-By must be disabled');
  assert.ok(healthRes.headers['x-xss-protection'] !== undefined, 'X-XSS-Protection must be present');

  const evilPreflight = await request(app)
    .options('/api/auth/login')
    .set('Origin', 'https://evil.com')
    .set('Access-Control-Request-Method', 'POST');
  assert.equal(evilPreflight.headers['access-control-allow-origin'], undefined, 'Evil origin must not be allowed');

  const goodPreflight = await request(app)
    .options('/api/auth/login')
    .set('Origin', 'http://localhost:5173')
    .set('Access-Control-Request-Method', 'POST');
  assert.equal(goodPreflight.status, 204, 'Allowed preflight should succeed');
  assert.equal(goodPreflight.headers['access-control-allow-origin'], 'http://localhost:5173', 'Known origin must be allowed');

  let sawRateLimit = false;
  let retryAfter: string | undefined;
  for (let i = 0; i < 15; i += 1) {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.example', password: 'wrong-password' });
    if (res.status === 429) {
      sawRateLimit = true;
      retryAfter = res.headers['retry-after'];
      break;
    }
  }
  assert.equal(sawRateLimit, true, 'Auth route must rate limit repeated failed logins');
  assert.ok(retryAfter, 'Retry-After header must be present when rate limited');

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin2@test.example', password: 'Passw0rd!2026' });
  assert.equal(loginRes.status, 200, 'Admin login must succeed');
  const authToken = readCookieValue(loginRes.headers['set-cookie'], 'auth_token');
  assert.ok(authToken, 'Login must set auth token cookie');

  const usersRes = await request(app)
    .get('/api/users')
    .set('Authorization', `Bearer ${authToken}`);
  assert.equal(usersRes.status, 200, 'Admin user listing must succeed');
  const users = Array.isArray(usersRes.body) ? usersRes.body : usersRes.body.items;
  assert.ok(Array.isArray(users) && users.length > 0, 'Users response must contain items');
  for (const user of users) {
    assert.equal(user.password, undefined, 'User response must not expose password');
    assert.equal(user.password_hash, undefined, 'User response must not expose password_hash');
    assert.equal(user.__v, undefined, 'User response must not expose __v');
  }

  const oversizedBody = 'a'.repeat(10 * 1024 * 1024);
  const oversizedRes = await request(app)
    .post('/api/auth/login')
    .set('Content-Type', 'application/json')
    .send(JSON.stringify({ email: 'admin@test.example', password: oversizedBody }));
  assert.equal(oversizedRes.status, 413, 'Oversized JSON bodies must be rejected with 413');

  const traversalRes = await request(app).get('/uploads/../../../etc/passwd');
  assert.ok([404, 400].includes(traversalRes.status), 'Path traversal via static-style path must not expose files');

  const originalFind = UserModel.find.bind(UserModel);
  (UserModel as any).find = () => {
    throw new Error('Simulated Mongo failure at C:/secret/path with internal var userQuery');
  };
  const errorRes = await request(app)
    .get('/api/users')
    .set('Authorization', `Bearer ${authToken}`);
  (UserModel as any).find = originalFind;
  assert.equal(errorRes.status, 500, 'Server errors should bubble as 500');
  assert.equal(errorRes.body.message, 'Internal Server Error', 'Production error responses must be generic');
  assert.equal(String(JSON.stringify(errorRes.body)).includes('Mongo'), false, 'Mongo details must not leak');
  assert.equal(String(JSON.stringify(errorRes.body)).includes('secret/path'), false, 'File paths must not leak');

  await mongoose.disconnect();
  await mongo.stop();
  console.log('API security tests passed.');
}

main().catch(async (error) => {
  console.error('API security tests failed.');
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});




