import { convertToBaseQty } from '../utils/unitConversion';

function assertClose(actual: number, expected: number, message: string) {
  const diff = Math.abs(actual - expected);
  if (diff > 1e-6) {
    throw new Error(`${message}. Expected ${expected}, got ${actual}`);
  }
}

assertClose(convertToBaseQty(1000, 'mg', 'g'), 1, 'mg to g');
assertClose(convertToBaseQty(1, 'kg', 'g'), 1000, 'kg to g');
assertClose(convertToBaseQty(1, 'L', 'mL'), 1000, 'L to mL');
assertClose(convertToBaseQty(250, 'mL', 'L'), 0.25, 'mL to L');

console.log('unitConversion tests passed');
