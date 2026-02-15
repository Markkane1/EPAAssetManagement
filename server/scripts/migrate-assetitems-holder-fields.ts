import mongoose from 'mongoose';
import { connectDatabase } from '../src/config/db';
import { AssetItemModel } from '../src/models/assetItem.model';

type AssetItemDoc = {
  _id: mongoose.Types.ObjectId;
  holder_type?: string | null;
  holder_id?: mongoose.Types.ObjectId | null;
  location_id?: mongoose.Types.ObjectId | null;
};

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

    const docs = (await AssetItemModel.collection
      .find(
        {},
        {
          projection: {
            _id: 1,
            holder_type: 1,
            holder_id: 1,
            location_id: 1,
          },
        }
      )
      .toArray()) as AssetItemDoc[];

    const beforeHolderCounts = countBy(docs, (doc) => String(doc.holder_type || '[EMPTY]').toUpperCase());
    printCounts('Before migration - holder_type counts', beforeHolderCounts);

    const operations: Array<Record<string, unknown>> = [];
    let toOffice = 0;
    let alreadySet = 0;
    let skipped = 0;

    for (const doc of docs) {
      const holderType = String(doc.holder_type || '').toUpperCase();
      const hasHolderId = Boolean(doc.holder_id);
      const hasLocation = Boolean(doc.location_id);

      if ((holderType === 'OFFICE' || holderType === 'STORE') && hasHolderId) {
        alreadySet += 1;
        continue;
      }

      if (hasLocation) {
        operations.push({
          updateOne: {
            filter: { _id: doc._id },
            update: {
              $set: {
                holder_type: 'OFFICE',
                holder_id: doc.location_id,
              },
            },
          },
        });
        toOffice += 1;
      } else {
        skipped += 1;
        console.warn(`Skipping asset item ${doc._id.toString()}: no location_id to infer holder fields.`);
      }
    }

    console.log('\nPlanned updates');
    console.log(`  Asset items scanned: ${docs.length}`);
    console.log(`  Asset items already using holder fields: ${alreadySet}`);
    console.log(`  Asset items to set holder_type=OFFICE from location_id: ${operations.length}`);
    console.log(`  Asset items skipped: ${skipped}`);

    if (!dryRun && operations.length > 0) {
      await AssetItemModel.bulkWrite(operations, { ordered: false });
      console.log('Bulk update applied.');
    } else if (dryRun) {
      console.log('Dry-run: no updates applied.');
    } else {
      console.log('No updates needed.');
    }

    if (dryRun) {
      printCounts(
        'After migration (expected, dry-run) - holder_type counts',
        countBy(docs, (doc) => {
          if (doc.holder_type && doc.holder_id) return String(doc.holder_type).toUpperCase();
          if (doc.location_id) return 'OFFICE';
          return '[EMPTY]';
        })
      );
    } else {
      const afterDocs = (await AssetItemModel.collection
        .find({}, { projection: { holder_type: 1 } })
        .toArray()) as Array<{ holder_type?: string | null }>;
      printCounts(
        'After migration - holder_type counts',
        countBy(afterDocs, (doc) => String(doc.holder_type || '[EMPTY]').toUpperCase())
      );
    }

    console.log(`\nSummary: ${toOffice} asset item(s) prepared with holder fields, ${skipped} skipped.`);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
}

run();
