import { connectDatabase } from '../src/config/db';
import { StoreModel } from '../src/models/store.model';

const HEAD_OFFICE_STORE_CODE = 'HEAD_OFFICE_STORE';

async function ensureHeadOfficeStore() {
  const existing = await StoreModel.findOne({ code: HEAD_OFFICE_STORE_CODE });
  if (existing) {
    console.log(`Store already exists: ${HEAD_OFFICE_STORE_CODE}`);
    return existing;
  }

  const created = await StoreModel.create({
    name: 'Head Office Store',
    code: HEAD_OFFICE_STORE_CODE,
    is_system: true,
    is_active: true,
  });

  console.log(`Created store: ${created.code}`);
  return created;
}

async function run() {
  try {
    await connectDatabase();
    await ensureHeadOfficeStore();
  } catch (error) {
    console.error('Failed to seed head office store:', error);
    process.exitCode = 1;
  } finally {
    process.exit();
  }
}

run();
