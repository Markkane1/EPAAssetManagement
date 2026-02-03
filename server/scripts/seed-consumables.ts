import { connectDatabase } from '../src/config/db';
import { ConsumableReasonCodeModel } from '../src/modules/consumables/models/consumableReasonCode.model';
import { OfficeModel } from '../src/models/office.model';

const reasonCodes = [
  { category: 'ADJUST', code: 'COUNT_VARIANCE', description: 'Cycle count variance' },
  { category: 'ADJUST', code: 'CORRECTION', description: 'Inventory correction' },
  { category: 'ADJUST', code: 'OTHER', description: 'Other adjustment' },
  { category: 'DISPOSE', code: 'SPILL', description: 'Spill or leak' },
  { category: 'DISPOSE', code: 'EXPIRED', description: 'Expired material' },
  { category: 'DISPOSE', code: 'BREAKAGE', description: 'Breakage' },
  { category: 'DISPOSE', code: 'CONTAMINATION', description: 'Contamination' },
  { category: 'DISPOSE', code: 'OTHER', description: 'Other disposal' },
];

async function seedReasonCodes() {
  for (const code of reasonCodes) {
    await ConsumableReasonCodeModel.findOneAndUpdate(
      { category: code.category, code: code.code },
      { $set: code },
      { upsert: true, new: true }
    );
  }
}

async function seedCentralStore() {
  const existing = await OfficeModel.findOne({ type: 'CENTRAL' });
  if (existing) return existing;

  const byName = await OfficeModel.findOne({ name: 'Central Store' });
  if (byName) {
    byName.type = 'CENTRAL';
    byName.is_active = true;
    await byName.save();
    return byName;
  }

  return OfficeModel.create({
    name: 'Central Store',
    type: 'CENTRAL',
    is_active: true,
  });
}

async function run() {
  try {
    await connectDatabase();
    await seedReasonCodes();
    const central = await seedCentralStore();
    console.log(`Seeded consumable reason codes. Central Store: ${central.name}`);
  } catch (error) {
    console.error('Failed to seed consumables:', error);
    process.exitCode = 1;
  } finally {
    process.exit();
  }
}

run();
