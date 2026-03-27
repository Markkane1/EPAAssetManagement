import mongoose from 'mongoose';
import { connectDatabase } from '../../src/config/db';

export type MigrationContext = {
  dryRun: boolean;
};

export function parseMigrationContext(argv: string[] = process.argv): MigrationContext {
  return {
    dryRun: argv.includes('--dry-run'),
  };
}

export function printMigrationBanner(label: string, dryRun: boolean) {
  console.warn(`WARNING: Back up your database before running ${label}.`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no writes)' : 'LIVE RUN (writes enabled)'}`);
}

export async function runMigration(
  label: string,
  execute: (context: MigrationContext) => Promise<void>,
  argv: string[] = process.argv
) {
  const context = parseMigrationContext(argv);
  printMigrationBanner(label, context.dryRun);

  try {
    await connectDatabase();
    await execute(context);
  } catch (error) {
    console.error(`${label} failed:`, error);
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
}
