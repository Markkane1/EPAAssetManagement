import mongoose from 'mongoose';
import { connectDatabase } from '../src/config/db';
import { TransferModel } from '../src/models/transfer.model';
import { StoreModel } from '../src/models/store.model';

const HEAD_OFFICE_STORE_CODE = 'HEAD_OFFICE_STORE';

type TransferDoc = {
  _id: mongoose.Types.ObjectId;
  status?: string | null;
  asset_item_id?: mongoose.Types.ObjectId | null;
  lines?: Array<{ asset_item_id?: mongoose.Types.ObjectId | string | null; notes?: string | null }> | null;
  store_id?: mongoose.Types.ObjectId | null;
  dispatched_at?: Date | null;
  received_at?: Date | null;
  dispatched_by_user_id?: mongoose.Types.ObjectId | null;
  received_by_user_id?: mongoose.Types.ObjectId | null;
  dispatched_to_dest_at?: Date | null;
  received_at_dest_at?: Date | null;
  dispatched_to_dest_by_user_id?: mongoose.Types.ObjectId | null;
  received_at_dest_by_user_id?: mongoose.Types.ObjectId | null;
};

const OLD_TO_NEW_STATUS: Record<string, string> = {
  REQUESTED: 'REQUESTED',
  APPROVED: 'APPROVED',
  DISPATCHED: 'DISPATCHED_TO_DEST',
  RECEIVED: 'RECEIVED_AT_DEST',
};

const KNOWN_NEW_STATUSES = new Set([
  'REQUESTED',
  'APPROVED',
  'DISPATCHED_TO_STORE',
  'RECEIVED_AT_STORE',
  'DISPATCHED_TO_DEST',
  'RECEIVED_AT_DEST',
  'REJECTED',
  'CANCELLED',
]);

function normalizeStatus(value: unknown) {
  return String(value ?? '')
    .trim()
    .toUpperCase();
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

    const store = await StoreModel.findOne({ code: HEAD_OFFICE_STORE_CODE, is_active: { $ne: false } });
    if (!store) {
      throw new Error(
        `System store ${HEAD_OFFICE_STORE_CODE} not found. Run: npx tsx scripts/seed-head-office-store.ts`
      );
    }

    const docs = (await TransferModel.collection
      .find(
        {},
        {
          projection: {
            _id: 1,
            status: 1,
            asset_item_id: 1,
            lines: 1,
            store_id: 1,
            dispatched_at: 1,
            received_at: 1,
            dispatched_by_user_id: 1,
            received_by_user_id: 1,
            dispatched_to_dest_at: 1,
            received_at_dest_at: 1,
            dispatched_to_dest_by_user_id: 1,
            received_at_dest_by_user_id: 1,
          },
        }
      )
      .toArray()) as TransferDoc[];

    printCounts('Before migration - status counts', countBy(docs, (doc) => normalizeStatus(doc.status) || '[EMPTY]'));

    const operations: Array<Record<string, unknown>> = [];
    const afterStatuses: string[] = [];
    let linesAdded = 0;
    let statusesMapped = 0;
    let storeLinked = 0;
    let skipped = 0;

    for (const doc of docs) {
      const oldStatus = normalizeStatus(doc.status) || '[EMPTY]';
      const mappedStatus = OLD_TO_NEW_STATUS[oldStatus] || (KNOWN_NEW_STATUSES.has(oldStatus) ? oldStatus : 'REQUESTED');
      const hasLines = Array.isArray(doc.lines) && doc.lines.some((line) => Boolean(line?.asset_item_id));
      const shouldAddLines = !hasLines && Boolean(doc.asset_item_id);

      if (!hasLines && !doc.asset_item_id) {
        skipped += 1;
        console.warn(`Skipping transfer ${doc._id.toString()}: no asset_item_id and no lines.`);
        afterStatuses.push(oldStatus);
        continue;
      }

      const setPayload: Record<string, unknown> = {
        status: mappedStatus,
        store_id: store._id,
      };

      if (shouldAddLines) {
        setPayload.lines = [{ asset_item_id: doc.asset_item_id, notes: null }];
      }

      if (mappedStatus === 'DISPATCHED_TO_DEST' || mappedStatus === 'RECEIVED_AT_DEST') {
        if (!doc.dispatched_to_dest_at && doc.dispatched_at) {
          setPayload.dispatched_to_dest_at = doc.dispatched_at;
        }
        if (!doc.dispatched_to_dest_by_user_id && doc.dispatched_by_user_id) {
          setPayload.dispatched_to_dest_by_user_id = doc.dispatched_by_user_id;
        }
      }
      if (mappedStatus === 'RECEIVED_AT_DEST') {
        if (!doc.received_at_dest_at && doc.received_at) {
          setPayload.received_at_dest_at = doc.received_at;
        }
        if (!doc.received_at_dest_by_user_id && doc.received_by_user_id) {
          setPayload.received_at_dest_by_user_id = doc.received_by_user_id;
        }
      }

      operations.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: setPayload },
        },
      });

      if (shouldAddLines) linesAdded += 1;
      if (mappedStatus !== oldStatus) statusesMapped += 1;
      if (!doc.store_id || String(doc.store_id) !== String(store._id)) storeLinked += 1;
      afterStatuses.push(mappedStatus);
    }

    console.log('\nPlanned updates');
    console.log(`  Transfers scanned: ${docs.length}`);
    console.log(`  Transfers to update: ${operations.length}`);
    console.log(`  Transfers skipped: ${skipped}`);
    console.log(`  Lines added from legacy asset_item_id: ${linesAdded}`);
    console.log(`  Status values mapped: ${statusesMapped}`);
    console.log(`  store_id linked to ${HEAD_OFFICE_STORE_CODE}: ${storeLinked}`);

    if (!dryRun && operations.length > 0) {
      await TransferModel.bulkWrite(operations, { ordered: false });
      console.log('Bulk update applied.');
    } else if (dryRun) {
      console.log('Dry-run: no updates applied.');
    } else {
      console.log('No updates needed.');
    }

    if (dryRun) {
      printCounts('After migration (expected, dry-run) - status counts', countBy(afterStatuses, (status) => status));
    } else {
      const afterDocs = (await TransferModel.collection
        .find({}, { projection: { status: 1 } })
        .toArray()) as Array<{ status?: string | null }>;
      printCounts(
        'After migration - status counts',
        countBy(afterDocs, (doc) => normalizeStatus(doc.status) || '[EMPTY]')
      );
    }

    console.log(`\nSummary: ${operations.length} transfer(s) prepared, ${skipped} skipped.`);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
}

run();
