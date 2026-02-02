const MASS_FACTORS: Record<string, number> = {
  mg: 0.001,
  g: 1,
  kg: 1000,
};

const VOLUME_FACTORS: Record<string, number> = {
  ml: 1,
  cc: 1,
  l: 1000,
};

export const getUnitGroup = (unit: string) => {
  const normalized = unit.trim().toLowerCase();
  if (normalized in MASS_FACTORS) return "mass";
  if (normalized in VOLUME_FACTORS) return "volume";
  return "other";
};

export const getCompatibleUnits = (unit: string) => {
  const group = getUnitGroup(unit);
  if (group === "mass") return Object.keys(MASS_FACTORS);
  if (group === "volume") return Object.keys(VOLUME_FACTORS);
  return [unit];
};

export const convertQuantity = (value: number, fromUnit: string, toUnit: string) => {
  const from = fromUnit.trim().toLowerCase();
  const to = toUnit.trim().toLowerCase();
  if (from === to) return value;

  if (from in MASS_FACTORS && to in MASS_FACTORS) {
    const grams = value * MASS_FACTORS[from];
    return grams / MASS_FACTORS[to];
  }

  if (from in VOLUME_FACTORS && to in VOLUME_FACTORS) {
    const ml = value * VOLUME_FACTORS[from];
    return ml / VOLUME_FACTORS[to];
  }

  return null;
};
