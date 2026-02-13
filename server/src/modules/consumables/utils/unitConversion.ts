export type UnitGroup = 'mass' | 'volume' | 'count';

export type UnitDefinition = {
  code: string;
  group: UnitGroup;
  toBase: number;
  aliases?: string[];
};

export type UnitLookup = {
  units: UnitDefinition[];
  byCode: Map<string, UnitDefinition>;
  byKey: Map<string, UnitDefinition>;
};

const normalizeKey = (value: string) => value.trim().toLowerCase();

function createUomError(message: string) {
  const error = new Error(message) as Error & { status?: number };
  error.status = 400;
  return error;
}

export function buildUnitLookup(units: UnitDefinition[]): UnitLookup {
  const byCode = new Map<string, UnitDefinition>();
  const byKey = new Map<string, UnitDefinition>();

  for (const unit of units) {
    byCode.set(unit.code, unit);
    const keys = [unit.code, unit.code.toLowerCase(), ...(unit.aliases || [])];
    for (const key of keys) {
      const normalized = normalizeKey(key);
      if (!byKey.has(normalized)) {
        byKey.set(normalized, unit);
      }
    }
  }

  return { units, byCode, byKey };
}

export function normalizeUom(input: string, lookup: UnitLookup): string {
  if (!lookup.units.length) {
    throw createUomError('No units configured');
  }
  const normalized = normalizeKey(input);
  const unit = lookup.byKey.get(normalized);
  if (!unit) {
    throw createUomError(`Unsupported unit: ${input}`);
  }
  return unit.code;
}

export function getUomType(uom: string, lookup: UnitLookup): UnitGroup {
  const normalized = normalizeUom(uom, lookup);
  const unit = lookup.byCode.get(normalized);
  if (!unit) {
    throw createUomError(`Unsupported unit: ${uom}`);
  }
  return unit.group;
}

export function isCompatibleUom(from: string, to: string, lookup: UnitLookup): boolean {
  try {
    return getUomType(from, lookup) === getUomType(to, lookup);
  } catch {
    return false;
  }
}

export function convertToBaseQty(
  enteredQty: number,
  enteredUom: string,
  baseUom: string,
  lookup: UnitLookup
) {
  const fromCode = normalizeUom(enteredUom, lookup);
  const toCode = normalizeUom(baseUom, lookup);
  const fromUnit = lookup.byCode.get(fromCode);
  const toUnit = lookup.byCode.get(toCode);
  if (!fromUnit || !toUnit) {
    throw createUomError(`Unsupported unit conversion from ${enteredUom} to ${baseUom}`);
  }
  if (fromUnit.group !== toUnit.group) {
    throw createUomError(`Incompatible unit conversion from ${enteredUom} to ${baseUom}`);
  }
  const canonicalQty = enteredQty * fromUnit.toBase;
  return canonicalQty / toUnit.toBase;
}

export function formatUom(uom: string, lookup: UnitLookup): string {
  return normalizeUom(uom, lookup);
}
