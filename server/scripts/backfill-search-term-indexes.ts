import mongoose from 'mongoose';
import { connectDatabase } from '../src/config/db';
import { UserModel } from '../src/models/user.model';
import { OfficeModel } from '../src/models/office.model';
import { VendorModel } from '../src/models/vendor.model';
import { ProjectModel } from '../src/models/project.model';
import { buildSearchTerms } from '../src/utils/searchTerms';

type SearchBackfillConfig = {
  label: string;
  model: any;
  projection: Record<string, 1>;
  resolveTerms: (doc: Record<string, unknown>) => string[];
};

function normalizeExistingTerms(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .sort();
}

function areTermsEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

async function backfillSearchTerms(config: SearchBackfillConfig, dryRun: boolean) {
  const cursor = config.model.collection.find(
    {},
    {
      projection: {
        _id: 1,
        search_terms: 1,
        ...config.projection,
      },
    }
  );

  let scanned = 0;
  let updated = 0;
  let operations: Array<Record<string, unknown>> = [];

  while (await cursor.hasNext()) {
    const doc = (await cursor.next()) as Record<string, unknown> | null;
    if (!doc) continue;

    scanned += 1;
    const nextTerms = config.resolveTerms(doc);
    const currentTerms = normalizeExistingTerms(doc.search_terms);
    if (areTermsEqual(currentTerms, nextTerms)) {
      continue;
    }

    updated += 1;
    operations.push({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { search_terms: nextTerms } },
      },
    });

    if (operations.length >= 250) {
      if (!dryRun) {
        await config.model.bulkWrite(operations, { ordered: false });
      }
      operations = [];
    }
  }

  if (operations.length > 0 && !dryRun) {
    await config.model.bulkWrite(operations, { ordered: false });
  }

  console.log(`${config.label}: scanned=${scanned}, updated=${updated}, mode=${dryRun ? 'dry-run' : 'live'}`);
}

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  console.warn('WARNING: Back up your database before running this migration.');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no writes)' : 'LIVE RUN (writes enabled)'}`);

  try {
    await connectDatabase();

    await backfillSearchTerms(
      {
        label: 'users',
        model: UserModel,
        projection: { email: 1, first_name: 1, last_name: 1 },
        resolveTerms: (doc) => buildSearchTerms([doc.email, doc.first_name, doc.last_name]),
      },
      dryRun
    );

    await backfillSearchTerms(
      {
        label: 'offices',
        model: OfficeModel,
        projection: { name: 1, code: 1, division: 1, district: 1 },
        resolveTerms: (doc) => buildSearchTerms([doc.name, doc.code, doc.division, doc.district]),
      },
      dryRun
    );

    await backfillSearchTerms(
      {
        label: 'vendors',
        model: VendorModel,
        projection: { name: 1, email: 1, phone: 1 },
        resolveTerms: (doc) => buildSearchTerms([doc.name, doc.email, doc.phone]),
      },
      dryRun
    );

    await backfillSearchTerms(
      {
        label: 'projects',
        model: ProjectModel,
        projection: { name: 1, code: 1 },
        resolveTerms: (doc) => buildSearchTerms([doc.name, doc.code]),
      },
      dryRun
    );
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
}

run().catch((error) => {
  console.error('Failed to backfill search-term indexes', error);
  process.exit(1);
});
