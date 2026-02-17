import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

type Agent = ReturnType<typeof request.agent>;

type EndpointBenchmark = {
  endpoint: string;
  scenario: string;
  iterations: number;
  concurrency: number;
  totalRequests: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
  throughputRps: number;
};

type BenchmarkOutput = {
  generatedAt: string;
  seedSummary: {
    offices: number;
    employees: number;
    assets: number;
    assetItems: number;
    assignments: number;
    maintenanceRecords: number;
    purchaseOrders: number;
    consumables: number;
    consumableBalances: number;
    divisions: number;
    districts: number;
    consumableItems: number;
    lots: number;
    containers: number;
    reasonCodes: number;
    units: number;
  };
  endpoints: EndpointBenchmark[];
};

type BenchCase = {
  name: string;
  path: string;
};

const SEED = {
  offices: 80,
  employees: 2000,
  assets: 3500,
  assetItems: 12000,
  assignments: 9000,
  maintenanceRecords: 7000,
  purchaseOrders: 5000,
  consumables: 3500,
  consumableBalances: 12000,
  divisions: 800,
  districts: 3500,
  consumableItems: 2000,
  lots: 8000,
  containers: 12000,
  reasonCodes: 300,
  units: 1500,
};

const CASES: BenchCase[] = [
  { name: 'dashboard_activity', path: '/api/dashboard/activity?limit=50' },
  { name: 'dashboard_all', path: '/api/dashboard' },
  { name: 'consumable_inventory_balances', path: '/api/consumables/inventory/balances' },
  { name: 'divisions_list', path: '/api/divisions' },
  { name: 'districts_list', path: '/api/districts' },
  { name: 'offices_capability_chemicals', path: '/api/offices?capability=chemicals' },
  { name: 'lots_list', path: '/api/consumables/lots' },
  { name: 'containers_list', path: '/api/consumables/containers' },
];

function parseArgs() {
  const args = process.argv.slice(2);
  const getArg = (name: string, fallback: number) => {
    const idx = args.findIndex((arg) => arg === `--${name}`);
    if (idx < 0 || idx + 1 >= args.length) return fallback;
    const parsed = Number.parseInt(args[idx + 1], 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const warmup = Math.max(1, getArg('warmup', 5));
  const iterations = Math.max(5, getArg('iterations', 30));
  const concurrency = Math.max(1, getArg('concurrency', 1));
  const scenario = (() => {
    const idx = args.findIndex((arg) => arg === '--scenario');
    if (idx < 0 || idx + 1 >= args.length) return 'baseline';
    return String(args[idx + 1] || 'baseline').trim().toLowerCase() || 'baseline';
  })();

  return { warmup, iterations, concurrency, scenario };
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

async function login(agent: Agent, email: string, password: string) {
  const res = await agent.post('/api/auth/login').send({ email, password });
  assert.equal(res.status, 200, `Expected login to succeed for ${email}, got ${res.status}`);
}

async function benchmarkEndpoint(agent: Agent, path: string, warmup: number, iterations: number, concurrency: number) {
  for (let i = 0; i < warmup; i += 1) {
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        const res = await agent.get(path);
        assert.equal(res.status, 200, `Warmup failed for ${path} with status ${res.status}`);
      })
    );
  }

  const durations: number[] = [];
  const benchmarkStarted = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    const batchDurations = await Promise.all(
      Array.from({ length: concurrency }, async () => {
        const started = performance.now();
        const res = await agent.get(path);
        const ended = performance.now();
        assert.equal(res.status, 200, `Benchmark request failed for ${path} with status ${res.status}`);
        return ended - started;
      })
    );
    durations.push(...batchDurations);
  }
  const benchmarkEnded = performance.now();

  const sorted = [...durations].sort((a, b) => a - b);
  const sum = durations.reduce((acc, value) => acc + value, 0);
  const totalRequests = durations.length;
  const totalSeconds = Math.max(0.001, (benchmarkEnded - benchmarkStarted) / 1000);

  return {
    iterations,
    concurrency,
    totalRequests,
    avgMs: Number((sum / durations.length).toFixed(2)),
    p50Ms: Number(percentile(sorted, 50).toFixed(2)),
    p95Ms: Number(percentile(sorted, 95).toFixed(2)),
    p99Ms: Number(percentile(sorted, 99).toFixed(2)),
    minMs: Number(sorted[0].toFixed(2)),
    maxMs: Number(sorted[sorted.length - 1].toFixed(2)),
    throughputRps: Number((totalRequests / totalSeconds).toFixed(2)),
  };
}

async function seedData() {
  const { OfficeModel } = await import('../../src/models/office.model');
  const { UserModel } = await import('../../src/models/user.model');
  const { EmployeeModel } = await import('../../src/models/employee.model');
  const { CategoryModel } = await import('../../src/models/category.model');
  const { AssetModel } = await import('../../src/models/asset.model');
  const { AssetItemModel } = await import('../../src/models/assetItem.model');
  const { AssignmentModel } = await import('../../src/models/assignment.model');
  const { MaintenanceRecordModel } = await import('../../src/models/maintenanceRecord.model');
  const { PurchaseOrderModel } = await import('../../src/models/purchaseOrder.model');
  const { ConsumableModel } = await import('../../src/models/consumable.model');
  const { RequisitionModel } = await import('../../src/models/requisition.model');
  const { RequisitionLineModel } = await import('../../src/models/requisitionLine.model');
  const { DivisionModel } = await import('../../src/models/division.model');
  const { DistrictModel } = await import('../../src/models/district.model');
  const { ConsumableItemModel } = await import('../../src/modules/consumables/models/consumableItem.model');
  const { ConsumableLotModel } = await import('../../src/modules/consumables/models/consumableLot.model');
  const { ConsumableContainerModel } = await import('../../src/modules/consumables/models/consumableContainer.model');
  const { ConsumableReasonCodeModel } = await import('../../src/modules/consumables/models/consumableReasonCode.model');
  const { ConsumableUnitModel } = await import('../../src/modules/consumables/models/consumableUnit.model');
  const { ConsumableInventoryBalanceModel } = await import(
    '../../src/modules/consumables/models/consumableInventoryBalance.model'
  );

  const officeTypes = ['HEAD_OFFICE', 'DIRECTORATE', 'DISTRICT_OFFICE', 'DISTRICT_LAB'] as const;
  const offices = await OfficeModel.insertMany(
    Array.from({ length: SEED.offices }, (_, i) => ({
      name: i === 0 ? 'Head Office' : `Office ${i + 1}`,
      type: officeTypes[i % officeTypes.length],
      is_active: true,
      capabilities:
        i % officeTypes.length === 2
          ? { chemicals: true, consumables: true, moveables: true }
          : { chemicals: false, consumables: true, moveables: true },
    })),
    { ordered: false }
  );

  const passwordHash = await bcrypt.hash('Passw0rd!', 10);
  const adminUser = await UserModel.create({
    email: 'perf-admin@example.com',
    password_hash: passwordHash,
    role: 'org_admin',
    first_name: 'Perf',
    last_name: 'Admin',
  });

  const employees = await EmployeeModel.insertMany(
    Array.from({ length: SEED.employees }, (_, i) => ({
      first_name: `Emp${i}`,
      last_name: `User${i}`,
      email: `emp-${i}@example.com`,
      location_id: offices[i % offices.length]._id,
      directorate_id: offices[(i + 1) % offices.length]._id,
      is_active: true,
    })),
    { ordered: false }
  );

  const categories = await CategoryModel.insertMany(
    Array.from({ length: 80 }, (_, i) => ({ name: `Category ${i + 1}`, is_active: true })),
    { ordered: false }
  );

  const assets = await AssetModel.insertMany(
    Array.from({ length: SEED.assets }, (_, i) => ({
      name: `Asset ${i + 1}`,
      category_id: categories[i % categories.length]._id,
      quantity: (i % 5) + 1,
      unit_price: 1000 + (i % 500),
      is_active: true,
    })),
    { ordered: false }
  );

  const assetItems = await AssetItemModel.insertMany(
    Array.from({ length: SEED.assetItems }, (_, i) => ({
      asset_id: assets[i % assets.length]._id,
      holder_type: 'OFFICE',
      holder_id: offices[i % offices.length]._id,
      item_status: i % 3 === 0 ? 'Assigned' : i % 3 === 1 ? 'Available' : 'Maintenance',
      is_active: true,
      assignment_status: i % 3 === 0 ? 'Assigned' : 'Unassigned',
    })),
    { ordered: false }
  );

  const benchmarkRequisition = await RequisitionModel.create({
    file_number: 'PERF-REQ-0001',
    office_id: offices[0]._id,
    issuing_office_id: offices[0]._id,
    requested_by_employee_id: employees[0]._id,
    target_type: 'EMPLOYEE',
    target_id: employees[0]._id,
    submitted_by_user_id: adminUser._id,
    status: 'VERIFIED_APPROVED',
  });
  const benchmarkRequisitionLine = await RequisitionLineModel.create({
    requisition_id: benchmarkRequisition._id,
    line_type: 'MOVEABLE',
    asset_id: assets[0]._id,
    requested_name: assets[0].name,
    requested_quantity: 1,
    approved_quantity: 1,
    fulfilled_quantity: 1,
    status: 'ASSIGNED',
  });

  await AssignmentModel.insertMany(
    Array.from({ length: SEED.assignments }, (_, i) => ({
      employee_id: employees[i % employees.length]._id,
      asset_item_id: assetItems[i % assetItems.length]._id,
      status: i % 5 === 0 ? 'RETURNED' : 'ISSUED',
      assigned_to_type: 'EMPLOYEE',
      assigned_to_id: employees[i % employees.length]._id,
      requisition_id: benchmarkRequisition._id,
      requisition_line_id: benchmarkRequisitionLine._id,
      issued_by_user_id: adminUser._id,
      issued_at: new Date(Date.now() - (i % 40) * 86400000),
      assigned_date: new Date(Date.now() - (i % 40) * 86400000),
      returned_date: i % 5 === 0 ? new Date(Date.now() - (i % 20) * 86400000) : null,
    })),
    { ordered: false }
  );

  await MaintenanceRecordModel.insertMany(
    Array.from({ length: SEED.maintenanceRecords }, (_, i) => ({
      asset_item_id: assetItems[i % assetItems.length]._id,
      maintenance_type: 'Preventive',
      description: `Maintenance ${i}`,
      scheduled_date: new Date(Date.now() + (i % 30) * 86400000),
      performed_by: `Technician ${i % 200}`,
      is_active: true,
    })),
    { ordered: false }
  );

  await PurchaseOrderModel.insertMany(
    Array.from({ length: SEED.purchaseOrders }, (_, i) => ({
      order_number: `PO-${i + 1}`,
      order_date: new Date(Date.now() - (i % 60) * 86400000).toISOString().slice(0, 10),
      total_amount: 10000 + i,
      status: i % 4 === 0 ? 'Draft' : i % 4 === 1 ? 'Pending' : 'Completed',
    })),
    { ordered: false }
  );

  const consumables = await ConsumableModel.insertMany(
    Array.from({ length: SEED.consumables }, (_, i) => ({
      name: `Consumable ${i + 1}`,
      unit: 'pcs',
      total_quantity: 100 + (i % 100),
      available_quantity: i % 5 === 0 ? 5 : 80,
      is_active: true,
    })),
    { ordered: false }
  );

  const divisions = await DivisionModel.insertMany(
    Array.from({ length: SEED.divisions }, (_, i) => ({
      name: `Division ${i + 1}`,
      is_active: true,
    })),
    { ordered: false }
  );

  await DistrictModel.insertMany(
    Array.from({ length: SEED.districts }, (_, i) => ({
      name: `District ${i + 1}`,
      division_id: divisions[i % divisions.length]._id,
      is_active: true,
    })),
    { ordered: false }
  );

  const consumableItems = await ConsumableItemModel.insertMany(
    Array.from({ length: SEED.consumableItems }, (_, i) => ({
      name: `Chemical Item ${i + 1}`,
      base_uom: i % 2 === 0 ? 'kg' : 'l',
      is_chemical: i % 2 === 0,
      is_controlled: i % 5 === 0,
      requires_lot_tracking: true,
    })),
    { ordered: false }
  );

  const lots = await ConsumableLotModel.insertMany(
    Array.from({ length: SEED.lots }, (_, i) => ({
      consumable_id: consumables[i % consumables.length]._id,
      holder_type: 'OFFICE',
      holder_id: offices[i % offices.length]._id,
      batch_no: `LOT-${i + 1}`,
      qty_received: 100 + (i % 50),
      qty_available: i % 7 === 0 ? 0 : 75,
      received_at: new Date(Date.now() - (i % 120) * 86400000),
      received_by_user_id: adminUser._id,
      consumable_item_id: consumableItems[i % consumableItems.length]._id,
      source_type: 'procurement',
      lot_number: `LOT-${i + 1}`,
      received_date: new Date(Date.now() - (i % 120) * 86400000).toISOString(),
      expiry_date: new Date(Date.now() + (i % 365) * 86400000),
    })),
    { ordered: false }
  );

  await ConsumableContainerModel.insertMany(
    Array.from({ length: SEED.containers }, (_, i) => ({
      lot_id: lots[i % lots.length]._id,
      container_code: `CTR-${i + 1}`,
      initial_qty_base: 100,
      current_qty_base: i % 7 === 0 ? 0 : 75,
      current_location_id: offices[i % offices.length]._id,
      status: i % 7 === 0 ? 'EMPTY' : 'IN_STOCK',
    })),
    { ordered: false }
  );

  await ConsumableReasonCodeModel.insertMany(
    Array.from({ length: SEED.reasonCodes }, (_, i) => ({
      category: i % 2 === 0 ? 'ADJUST' : 'DISPOSE',
      code: `R${String(i + 1).padStart(4, '0')}`,
      description: `Reason ${i + 1}`,
    })),
    { ordered: false }
  );

  await ConsumableUnitModel.insertMany(
    Array.from({ length: SEED.units }, (_, i) => ({
      code: `U${String(i + 1).padStart(5, '0')}`,
      name: `Unit ${i + 1}`,
      group: i % 3 === 0 ? 'mass' : i % 3 === 1 ? 'volume' : 'count',
      to_base: 1 + (i % 10) * 0.1,
      is_active: i % 4 !== 0,
    })),
    { ordered: false }
  );

  await ConsumableInventoryBalanceModel.insertMany(
    Array.from({ length: SEED.consumableBalances }, (_, i) => {
      const cycle = Math.floor(i / lots.length);
      const officeIndex = (i + cycle) % offices.length;
      return {
        holder_type: 'OFFICE',
        holder_id: offices[officeIndex]._id,
        consumable_item_id: consumableItems[i % consumableItems.length]._id,
        lot_id: lots[i % lots.length]._id,
        qty_on_hand_base: 10 + (i % 100),
        qty_reserved_base: i % 3,
      };
    }),
    { ordered: false }
  );

  return { adminUser };
}

async function main() {
  const { warmup, iterations, concurrency, scenario } = parseArgs();
  const mongo = await MongoMemoryServer.create();
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);

  process.env.NODE_ENV = 'test';
  process.env.MONGO_URI = mongo.getUri();
  process.env.JWT_SECRET = '0123456789abcdef0123456789abcdef';
  process.env.CORS_ORIGIN = 'http://localhost:5173';
  process.env.JWT_EXPIRES_IN = '7d';
  process.env.SEED_SUPER_ADMIN = 'false';

  const { connectDatabase } = await import('../../src/config/db');
  const { createApp } = await import('../../src/app');

  await connectDatabase();
  await seedData();

  const app = createApp();
  const agent = request.agent(app);
  // Suppress per-request morgan noise so the benchmark output stays machine-readable.
  process.stdout.write = (() => true) as typeof process.stdout.write;
  await login(agent, 'perf-admin@example.com', 'Passw0rd!');

  const endpoints: EndpointBenchmark[] = [];
  for (const benchCase of CASES) {
    const stats = await benchmarkEndpoint(agent, benchCase.path, warmup, iterations, concurrency);
    endpoints.push({
      endpoint: benchCase.name,
      scenario,
      ...stats,
    });
  }

  const output: BenchmarkOutput = {
    generatedAt: new Date().toISOString(),
    seedSummary: { ...SEED },
    endpoints,
  };

  process.stdout.write = originalStdoutWrite;
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);

  await mongoose.disconnect();
  await mongo.stop();
}

main().catch(async (error) => {
  console.error('Benchmark failed');
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
