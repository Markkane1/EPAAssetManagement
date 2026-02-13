import { buildUnitLookup, convertToBaseQty } from '../../src/modules/consumables/utils/unitConversion';

const unitLookup = buildUnitLookup([
  { code: 'mg', group: 'mass', toBase: 0.001 },
  { code: 'g', group: 'mass', toBase: 1 },
  { code: 'kg', group: 'mass', toBase: 1000 },
  { code: 'mL', group: 'volume', toBase: 1, aliases: ['ml'] },
  { code: 'L', group: 'volume', toBase: 1000, aliases: ['l'] },
]);

function assertClose(actual: number, expected: number, message: string) {
  const diff = Math.abs(actual - expected);
  if (diff > 1e-6) {
    throw new Error(`${message}. Expected ${expected}, got ${actual}`);
  }
}

assertClose(convertToBaseQty(1000, 'mg', 'g', unitLookup), 1, 'mg to g');
assertClose(convertToBaseQty(1, 'kg', 'g', unitLookup), 1000, 'kg to g');
assertClose(convertToBaseQty(1, 'L', 'mL', unitLookup), 1000, 'L to mL');
assertClose(convertToBaseQty(250, 'mL', 'L', unitLookup), 0.25, 'mL to L');

console.log('unitConversion tests passed');
