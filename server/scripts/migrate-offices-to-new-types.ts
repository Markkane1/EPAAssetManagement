import mongoose from 'mongoose';
import { connectDatabase } from '../src/config/db';
import { OfficeModel } from '../src/models/office.model';

type NewOfficeType = 'DIRECTORATE' | 'DISTRICT_OFFICE' | 'DISTRICT_LAB';

type OfficeDoc = {
  _id: mongoose.Types.ObjectId;
  name?: string | null;
  type?: string | null;
  lab_code?: unknown;
  capabilities?: { chemicals?: unknown } | null;
  parent_office_id?: mongoose.Types.ObjectId | null;
  parent_location_id?: mongoose.Types.ObjectId | null;
};

const NEW_TYPES = new Set<NewOfficeType>(['DIRECTORATE', 'DISTRICT_OFFICE', 'DISTRICT_LAB']);

function normalizeType(value: unknown) {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

function hasDirectorateInName(name: unknown) {
  return String(name ?? '').toLowerCase().includes('directorate');
}

function mapType(doc: OfficeDoc): NewOfficeType {
  const rawType = normalizeType(doc.type);
  if (NEW_TYPES.has(rawType as NewOfficeType)) {
    return rawType as NewOfficeType;
  }

  const hasLabCode = doc.lab_code !== null && doc.lab_code !== undefined;
  const chemicalsEnabled = doc.capabilities?.chemicals === true;

  if (rawType === 'LAB' || hasLabCode || chemicalsEnabled) {
    return 'DISTRICT_LAB';
  }
  if (rawType === 'SUBSTORE') {
    return 'DISTRICT_OFFICE';
  }
  if (rawType === 'CENTRAL') {
    return 'DIRECTORATE';
  }
  if (hasDirectorateInName(doc.name)) {
    return 'DIRECTORATE';
  }
  return 'DISTRICT_OFFICE';
}

function countBy<T>(items: T[], keySelector: (item: T) => string) {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = keySelector(item);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Object.fromEntries(Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)));
}

function printCounts(label: string, counts: Record<string, number>) {
  console.log(`\n${label}`);
  const entries = Object.entries(counts);
  if (entries.length === 0) {
    console.log('  (none)');
    return;
  }
  for (const [key, value] of entries) {
    console.log(`  ${key}: ${value}`);
  }
}

async function run() {
  const dryRun = process.argv.includes('--dry-run');

  console.warn('WARNING: Back up your database before running this migration.');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no writes)' : 'LIVE RUN (writes enabled)'}`);

  try {
    await connectDatabase();

    const docs = (await OfficeModel.collection
      .find(
        {},
        {
          projection: {
            _id: 1,
            name: 1,
            type: 1,
            lab_code: 1,
            capabilities: 1,
            parent_office_id: 1,
            parent_location_id: 1,
          },
        }
      )
      .toArray()) as OfficeDoc[];

    const beforeOldTypeCounts = countBy(docs, (doc) => {
      const type = normalizeType(doc.type);
      return type || '[EMPTY]';
    });
    const beforeMappedNewTypeCounts = countBy(docs, (doc) => mapType(doc));

    printCounts('Before migration - current type counts', beforeOldTypeCounts);
    printCounts('Before migration - mapped new type counts', beforeMappedNewTypeCounts);

    let typeUpdates = 0;
    let parentUpdates = 0;
    const operations: Array<Record<string, unknown>> = [];

    for (const doc of docs) {
      const updates: Record<string, unknown> = {};
      const nextType = mapType(doc);
      if (normalizeType(doc.type) !== nextType) {
        updates.type = nextType;
        typeUpdates += 1;
      }
      if (!doc.parent_office_id && doc.parent_location_id) {
        updates.parent_office_id = doc.parent_location_id;
        parentUpdates += 1;
      }
      if (Object.keys(updates).length > 0) {
        operations.push({
          updateOne: {
            filter: { _id: doc._id },
            update: { $set: updates },
          },
        });
      }
    }

    console.log('\nPlanned updates');
    console.log(`  Documents scanned: ${docs.length}`);
    console.log(`  Documents to update: ${operations.length}`);
    console.log(`  Type updates: ${typeUpdates}`);
    console.log(`  Parent field updates: ${parentUpdates}`);

    if (!dryRun && operations.length > 0) {
      await OfficeModel.bulkWrite(operations, { ordered: false });
      console.log('Bulk update applied.');
    } else if (dryRun) {
      console.log('Dry-run: no updates applied.');
    } else {
      console.log('No updates needed.');
    }

    if (dryRun) {
      printCounts('After migration (expected, dry-run)', beforeMappedNewTypeCounts);
      console.log('\nAfter migration unknown type count (expected): 0');
    } else {
      const afterDocs = (await OfficeModel.collection
        .find({}, { projection: { type: 1 } })
        .toArray()) as Array<{ type?: string | null }>;

      const afterTypeCounts = countBy(afterDocs, (doc) => {
        const type = normalizeType(doc.type);
        return type || '[EMPTY]';
      });
      const afterUnknownCount = afterDocs.filter((doc) => !NEW_TYPES.has(normalizeType(doc.type) as NewOfficeType)).length;

      printCounts('After migration - current type counts', afterTypeCounts);
      console.log(`\nAfter migration unknown type count: ${afterUnknownCount}`);
    }
  } catch (error) {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
}

run();
