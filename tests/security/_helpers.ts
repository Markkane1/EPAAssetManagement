import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

export type Agent = ReturnType<typeof request.agent>;

export interface LoginSession {
  authToken: string;
  csrfToken: string;
}

export interface SeededContext {
  mongo: MongoMemoryReplSet;
  app: ReturnType<(typeof import('../../server/src/app'))['createApp']>;
  models: {
    UserModel: typeof import('../../server/src/models/user.model').UserModel;
    OfficeModel: typeof import('../../server/src/models/office.model').OfficeModel;
    EmployeeModel: typeof import('../../server/src/models/employee.model').EmployeeModel;
    DocumentModel: typeof import('../../server/src/models/document.model').DocumentModel;
    VendorModel: typeof import('../../server/src/models/vendor.model').VendorModel;
    AssetModel: typeof import('../../server/src/models/asset.model').AssetModel;
    AssetItemModel: typeof import('../../server/src/models/assetItem.model').AssetItemModel;
    AssignmentModel: typeof import('../../server/src/models/assignment.model').AssignmentModel;
    MaintenanceRecordModel: typeof import('../../server/src/models/maintenanceRecord.model').MaintenanceRecordModel;
  };
  offices: {
    officeA: any;
    officeB: any;
    headOffice: any;
  };
  users: {
    admin: any;
    employeeA: any;
    employeeB: any;
    officeHeadA: any;
    officeHeadB: any;
    caretakerA: any;
  };
  password: string;
}

export interface RouteSpec {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  middlewares: string;
  sourceFile: string;
}

export const TEST_JWT_SECRET = '0123456789abcdef0123456789abcdef';
export const TEST_PASSWORD = 'Passw0rd!2026';
export const TEST_OBJECT_ID = '507f1f77bcf86cd799439011';

const workspaceRoot = path.resolve(process.cwd());
const testCacheRoot = path.resolve(workspaceRoot, '..', '.ams-test-cache', path.basename(workspaceRoot));
const routesIndexPath = path.join(workspaceRoot, 'src', 'routes', 'index.ts');
const mongoCacheDir = path.join(testCacheRoot, 'mongodb-binaries');
const securityMongoRoot = path.join(testCacheRoot, 'security-mongo');
function resolveMongoBinaryConfig() {
  const systemBinary = process.env.MONGOMS_SYSTEM_BINARY;

  if (systemBinary) {
    return { systemBinary };
  }

  return {
    version: process.env.MONGOMS_VERSION || '7.0.14',
  };
}

export function readCookieValue(setCookie: string[] | undefined, cookieName: string) {
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

export async function login(agent: Agent, email: string, password: string): Promise<LoginSession> {
  const res = await agent.post('/api/auth/login').send({ email, password });
  assert.equal(res.status, 200, `Expected login to succeed for ${email}, got ${res.status}`);
  const authToken = readCookieValue(res.headers['set-cookie'], 'auth_token');
  const csrfToken = readCookieValue(res.headers['set-cookie'], 'csrf_token');
  assert.ok(authToken, 'Login must return auth token cookie');
  assert.ok(csrfToken, 'Login must return CSRF token cookie');
  return { authToken: authToken as string, csrfToken: csrfToken as string };
}

export function signBearerToken(payload: Record<string, unknown>, options?: jwt.SignOptions) {
  return jwt.sign(payload, TEST_JWT_SECRET, {
    algorithm: 'HS256',
    ...(options || {}),
  });
}

export function buildAuthPayload(user: { id: string; email: string; role?: string; roles?: string[]; active_role?: string; location_id?: any; token_version?: number; }) {
  const role = String(user.active_role || user.role || 'employee').trim().toLowerCase();
  const roles = Array.isArray(user.roles) && user.roles.length > 0
    ? user.roles.map((entry) => String(entry).trim().toLowerCase())
    : [role];
  return {
    userId: String(user.id),
    email: String(user.email),
    role,
    activeRole: role,
    roles,
    locationId: user.location_id ? String(user.location_id) : null,
    isOrgAdmin: roles.includes('org_admin'),
    tokenVersion: Number(user.token_version || 0),
  };
}

export async function bootstrapSecurityApp() {
  const binaryConfig = resolveMongoBinaryConfig();
  const mongoDbPath = path.join(securityMongoRoot, `repl-${process.pid}`);
  fs.mkdirSync(mongoDbPath, { recursive: true });
  if (!('systemBinary' in binaryConfig)) {
    fs.mkdirSync(mongoCacheDir, { recursive: true });
  }

  const mongo = await MongoMemoryReplSet.create({
    binary: {
      ...binaryConfig,
      downloadDir: mongoCacheDir,
    },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
    instanceOpts: [{ launchTimeout: 30000, dbPath: mongoDbPath }],
  });
  process.env.NODE_ENV = 'test';
  process.env.MONGO_URI = mongo.getUri();
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  process.env.CORS_ORIGIN = 'http://localhost:5173';
  process.env.JWT_EXPIRES_IN = '7d';
  process.env.SEED_SUPER_ADMIN = 'false';
  process.env.MONGO_REQUIRE_REPLICA_SET = 'true';
  process.env.RATE_LIMIT_BACKEND = 'memory';

  const { connectDatabase } = await import('../../server/src/config/db');
  const { createApp } = await import('../../server/src/app');
  const { UserModel } = await import('../../server/src/models/user.model');
  const { OfficeModel } = await import('../../server/src/models/office.model');
  const { EmployeeModel } = await import('../../server/src/models/employee.model');
  const { DocumentModel } = await import('../../server/src/models/document.model');
  const { VendorModel } = await import('../../server/src/models/vendor.model');
  const { AssetModel } = await import('../../server/src/models/asset.model');
  const { AssetItemModel } = await import('../../server/src/models/assetItem.model');
  const { AssignmentModel } = await import('../../server/src/models/assignment.model');
  const { MaintenanceRecordModel } = await import('../../server/src/models/maintenanceRecord.model');

  await connectDatabase();
  const app = createApp();

  return {
    mongo,
    app,
    models: { UserModel, OfficeModel, EmployeeModel, DocumentModel, VendorModel, AssetModel, AssetItemModel, AssignmentModel, MaintenanceRecordModel },
  };
}

export async function seedSecurityData(): Promise<SeededContext> {
  const base = await bootstrapSecurityApp();
  const { OfficeModel, UserModel, EmployeeModel, DocumentModel, AssetModel, AssetItemModel, AssignmentModel, MaintenanceRecordModel } = base.models;
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

  const headOffice = await OfficeModel.create({ name: 'Central Store', type: 'HEAD_OFFICE', is_active: true });
  const officeA = await OfficeModel.create({ name: 'District Office A', type: 'DISTRICT_OFFICE', is_active: true });
  const officeB = await OfficeModel.create({ name: 'District Office B', type: 'DISTRICT_OFFICE', is_active: true });

  const admin = await UserModel.create({
    email: 'admin@test.example',
    password_hash: passwordHash,
    role: 'org_admin',
    roles: ['org_admin'],
    active_role: 'org_admin',
    first_name: 'Admin',
    last_name: 'User',
  });
  const officeHeadA = await UserModel.create({
    email: 'office-head-a@test.example',
    password_hash: passwordHash,
    role: 'office_head',
    roles: ['office_head'],
    active_role: 'office_head',
    first_name: 'Office',
    last_name: 'HeadA',
    location_id: officeA.id,
  });
  const officeHeadB = await UserModel.create({
    email: 'office-head-b@test.example',
    password_hash: passwordHash,
    role: 'office_head',
    roles: ['office_head'],
    active_role: 'office_head',
    first_name: 'Office',
    last_name: 'HeadB',
    location_id: officeB.id,
  });
  const caretakerA = await UserModel.create({
    email: 'caretaker-a@test.example',
    password_hash: passwordHash,
    role: 'caretaker',
    roles: ['caretaker'],
    active_role: 'caretaker',
    first_name: 'Care',
    last_name: 'TakerA',
    location_id: officeA.id,
  });
  const employeeA = await UserModel.create({
    email: 'employee-a@test.example',
    password_hash: passwordHash,
    role: 'employee',
    roles: ['employee'],
    active_role: 'employee',
    first_name: 'Employee',
    last_name: 'A',
    location_id: officeA.id,
  });
  const employeeB = await UserModel.create({
    email: 'employee-b@test.example',
    password_hash: passwordHash,
    role: 'employee',
    roles: ['employee'],
    active_role: 'employee',
    first_name: 'Employee',
    last_name: 'B',
    location_id: officeB.id,
  });

  const employeeProfileA = await EmployeeModel.create({ user_id: employeeA.id, email: employeeA.email, first_name: 'Employee', last_name: 'A', location_id: officeA.id, is_active: true });
  await EmployeeModel.create({ user_id: employeeB.id, email: employeeB.email, first_name: 'Employee', last_name: 'B', location_id: officeB.id, is_active: true });

  await DocumentModel.create({ title: 'Employee A Private Doc', doc_type: 'Invoice', office_id: officeA.id, created_by_user_id: employeeA.id });
  const asset = await AssetModel.create({ name: 'Security Asset', quantity: 1 });
  const assetItem = await AssetItemModel.create({ asset_id: asset.id, holder_type: 'OFFICE', holder_id: officeA.id, assignment_status: 'Unassigned', item_status: 'Available' });
  await AssignmentModel.create({
    asset_item_id: assetItem.id,
    status: 'DRAFT',
    assigned_to_type: 'EMPLOYEE',
    assigned_to_id: employeeProfileA.id,
    employee_id: employeeProfileA.id,
    requisition_id: new mongoose.Types.ObjectId(),
    requisition_line_id: new mongoose.Types.ObjectId(),
    assigned_date: new Date(),
    is_active: true,
  });
  await MaintenanceRecordModel.create({ asset_item_id: assetItem.id, maintenance_type: 'Preventive', maintenance_status: 'Scheduled', description: 'Security scope maintenance' });

  return {
    ...base,
    offices: { officeA, officeB, headOffice },
    users: { admin, employeeA, employeeB, officeHeadA, officeHeadB, caretakerA },
    password: TEST_PASSWORD,
  };
}

export async function cleanupSecurityContext(ctx: { mongo: MongoMemoryReplSet }) {
  await mongoose.disconnect();
  await ctx.mongo.stop();
  fs.rmSync(securityMongoRoot, { recursive: true, force: true });
}

function normalizePath(prefix: string, routePath: string) {
  const joined = `${prefix}/${routePath}`.replace(/\/+/g, '/');
  return joined.replace(/\/+/g, '/').replace(/\/\/$/, '') || '/';
}

function resolveRoutePath(routePath: string) {
  return routePath.replace(/:[A-Za-z0-9_]+/g, TEST_OBJECT_ID);
}

export function materializeRoutePath(pathname: string) {
  return resolveRoutePath(pathname);
}

export function discoverProtectedRoutes(): RouteSpec[] {
  const indexSource = fs.readFileSync(routesIndexPath, 'utf8');
  const importMatches = [...indexSource.matchAll(/import\s+(\w+)\s+from\s+'([^']+)'/g)];
  const importMap = new Map(importMatches.map((match) => [match[1], match[2]]));
  const mountMatches = [...indexSource.matchAll(/router\.use\('([^']+)',\s*(\w+)\);/g)];
  const routes: RouteSpec[] = [];

  for (const match of mountMatches) {
    const mountPath = match[1];
    const alias = match[2];
    const importPath = importMap.get(alias);
    if (!importPath) continue;
    const routeFile = path.resolve(path.dirname(routesIndexPath), `${importPath}.ts`);
    if (!fs.existsSync(routeFile)) continue;
    const source = fs.readFileSync(routeFile, 'utf8');
    const globalRequireAuth = /router\.use\(requireAuth\);/.test(source);
    const flattened = source.replace(/\r?\n/g, ' ');
    const routeMatches = [...flattened.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']+)'\s*,\s*([\s\S]*?)\);/g)];
    for (const routeMatch of routeMatches) {
      const method = routeMatch[1].toUpperCase() as RouteSpec['method'];
      const routePath = routeMatch[2];
      const middlewares = routeMatch[3].replace(/\s+/g, ' ').trim();
      if (!globalRequireAuth && !middlewares.includes('requireAuth')) {
        continue;
      }
      const prefix = mountPath === '/' ? '/api' : `/api${mountPath}`;
      routes.push({
        method,
        path: normalizePath(prefix, routePath),
        middlewares,
        sourceFile: path.relative(workspaceRoot, routeFile).replace(/\\/g, '/'),
      });
    }
  }

  return routes
    .filter((route, index, all) => all.findIndex((entry) => entry.method === route.method && entry.path === route.path) === index)
    .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

export async function requestRoute(app: any, route: RouteSpec, options?: { token?: string | null; origin?: string; body?: unknown; methodOverride?: string; }) {
  const method = (options?.methodOverride || route.method).toLowerCase();
  const url = materializeRoutePath(route.path);
  let req = request(app)[method as 'get'](url);
  if (options?.origin) req = req.set('Origin', options.origin);
  if (options?.token !== undefined && options?.token !== null) {
    req = req.set('Authorization', `Bearer ${options.token}`);
  }
  if (options?.body !== undefined && ['post', 'put', 'patch', 'delete'].includes(method)) {
    req = req.send(options.body);
  }
  return req;
}



