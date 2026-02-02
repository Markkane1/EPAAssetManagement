export const SUPPORTED_UOMS = ['g', 'mg', 'kg', 'mL', 'L'] as const;
export type SupportedUom = (typeof SUPPORTED_UOMS)[number];

type UomType = 'mass' | 'volume';

const UNIT_DEFS: Record<SupportedUom, { type: UomType; toCanonical: number }> = {
  mg: { type: 'mass', toCanonical: 0.001 },
  g: { type: 'mass', toCanonical: 1 },
  kg: { type: 'mass', toCanonical: 1000 },
  mL: { type: 'volume', toCanonical: 1 },
  L: { type: 'volume', toCanonical: 1000 },
};

function createUomError(message: string) {
  const error = new Error(message) as Error & { status?: number };
  error.status = 400;
  return error;
}

export function normalizeUom(input: string): SupportedUom {
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();
  if (lower === 'ml') return 'mL';
  if (lower === 'l') return 'L';
  if (lower === 'mg') return 'mg';
  if (lower === 'g') return 'g';
  if (lower === 'kg') return 'kg';
  if (trimmed === 'mL') return 'mL';
  if (trimmed === 'L') return 'L';
  throw createUomError(`Unsupported unit: ${input}`);
}

export function getUomType(uom: SupportedUom): UomType {
  return UNIT_DEFS[uom].type;
}

export function isCompatibleUom(from: string, to: string): boolean {
  try {
    const fromNorm = normalizeUom(from);
    const toNorm = normalizeUom(to);
    return getUomType(fromNorm) === getUomType(toNorm);
  } catch {
    return false;
  }
}

export function convertToBaseQty(enteredQty: number, enteredUom: string, baseUom: string) {
  const from = normalizeUom(enteredUom);
  const to = normalizeUom(baseUom);
  if (UNIT_DEFS[from].type !== UNIT_DEFS[to].type) {
    throw createUomError(`Incompatible unit conversion from ${enteredUom} to ${baseUom}`);
  }
  const canonicalQty = enteredQty * UNIT_DEFS[from].toCanonical;
  const baseQty = canonicalQty / UNIT_DEFS[to].toCanonical;
  return baseQty;
}

export function formatUom(uom: string): SupportedUom {
  return normalizeUom(uom);
}
