import mongoose from 'mongoose';
import { connectDatabase } from '../src/config/db';
import { UserModel } from '../src/models/user.model';

type NewRole = 'org_admin' | 'office_head' | 'caretaker' | 'employee';

type UserDoc = {
  _id: mongoose.Types.ObjectId;
  email?: string | null;
  role?: string | null;
  location_id?: mongoose.Types.ObjectId | null;
};

const ORG_ADMIN_SOURCE_ROLES = new Set([
  'super_admin',
  'admin',
  'headoffice_admin',
  'auditor',
  'viewer',
]);

const OFFICE_HEAD_SOURCE_ROLES = new Set([
  'office_head',
  'directorate_head',
  'location_admin',
  'lab_manager',
]);

const CARETAKER_SOURCE_ROLES = new Set([
  'caretaker',
  'assistant_caretaker',
  'central_store_admin',
  'lab_user',
]);

const NEW_ROLE_SET = new Set<NewRole>(['org_admin', 'office_head', 'caretaker', 'employee']);

function normalizeRole(role: unknown) {
  return String(role ?? '')
    .trim()
    .toLowerCase();
}

function mapRole(role: unknown): NewRole {
  const normalized = normalizeRole(role);

  if (NEW_ROLE_SET.has(normalized as NewRole)) {
    return normalized as NewRole;
  }
  if (ORG_ADMIN_SOURCE_ROLES.has(normalized)) {
    return 'org_admin';
  }
  if (OFFICE_HEAD_SOURCE_ROLES.has(normalized)) {
    return 'office_head';
  }
  if (CARETAKER_SOURCE_ROLES.has(normalized)) {
    return 'caretaker';
  }
  return 'employee';
}

function countBy<T>(items: T[], keySelector: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keySelector(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Object.fromEntries(Array.from(counts.entries()).sort(([a], [b]) => a.localeCompare(b)));
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

    const docs = (await UserModel.collection
      .find(
        {},
        {
          projection: {
            _id: 1,
            email: 1,
            role: 1,
            location_id: 1,
          },
        }
      )
      .toArray()) as UserDoc[];

    const beforeRoleCounts = countBy(docs, (doc) => normalizeRole(doc.role) || '[EMPTY]');
    const mappedRoleCounts = countBy(docs, (doc) => mapRole(doc.role));

    printCounts('Before migration - current role counts', beforeRoleCounts);
    printCounts('Before migration - mapped role counts', mappedRoleCounts);

    const operations: Array<Record<string, unknown>> = [];
    let changedUsers = 0;
    let skippedUsers = 0;
    const expectedAfterRoles: string[] = [];

    for (const doc of docs) {
      const oldRole = normalizeRole(doc.role) || '[EMPTY]';
      const newRole = mapRole(doc.role);
      const hasLocation = Boolean(doc.location_id);

      if (newRole !== 'org_admin' && !hasLocation) {
        skippedUsers += 1;
        console.warn(
          `Skipping user ${doc.email || doc._id.toString()}: mapped role '${newRole}' requires non-null location_id.`
        );
        expectedAfterRoles.push(oldRole);
        continue;
      }

      expectedAfterRoles.push(newRole);

      if (oldRole !== newRole) {
        operations.push({
          updateOne: {
            filter: { _id: doc._id },
            update: { $set: { role: newRole } },
          },
        });
        changedUsers += 1;
      }
    }

    console.log('\nPlanned updates');
    console.log(`  Users scanned: ${docs.length}`);
    console.log(`  Users to update: ${operations.length}`);
    console.log(`  Users skipped (location_id required): ${skippedUsers}`);

    if (!dryRun && operations.length > 0) {
      await UserModel.bulkWrite(operations, { ordered: false });
      console.log('Bulk update applied.');
    } else if (dryRun) {
      console.log('Dry-run: no updates applied.');
    } else {
      console.log('No updates needed.');
    }

    if (dryRun) {
      const expectedAfterCounts = countBy(expectedAfterRoles, (role) => role);
      printCounts('After migration (expected, dry-run)', expectedAfterCounts);
    } else {
      const afterDocs = (await UserModel.collection
        .find({}, { projection: { role: 1 } })
        .toArray()) as Array<{ role?: string | null }>;
      const afterCounts = countBy(afterDocs, (doc) => normalizeRole(doc.role) || '[EMPTY]');
      printCounts('After migration - current role counts', afterCounts);
    }

    console.log(`\nSummary: ${changedUsers} user(s) mapped, ${skippedUsers} skipped.`);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
}

run();
