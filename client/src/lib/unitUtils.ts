import type { ConsumableUnit } from '@/types';

type UnitLike = Pick<ConsumableUnit, 'code' | 'group' | 'to_base' | 'aliases'>;

const DEFAULT_UNITS: UnitLike[] = [
  { code: 'mg', group: 'mass', to_base: 0.001, aliases: ['milligram', 'milligrams'] },
  { code: 'g', group: 'mass', to_base: 1, aliases: ['gram', 'grams'] },
  { code: 'kg', group: 'mass', to_base: 1000, aliases: ['kilogram', 'kilograms'] },
  { code: 'mL', group: 'volume', to_base: 1, aliases: ['ml', 'cc', 'millilitre', 'milliliters', 'millilitres'] },
  { code: 'L', group: 'volume', to_base: 1000, aliases: ['l', 'litre', 'liters', 'litres'] },
];

const normalizeKey = (value: string) => value.trim().toLowerCase();

const getUnitList = (units?: UnitLike[]) => (units && units.length ? units : DEFAULT_UNITS);

const findUnit = (unit: string, units: UnitLike[]) => {
  const key = normalizeKey(unit);
  return units.find((entry) => {
    if (normalizeKey(entry.code) === key) return true;
    return (entry.aliases || []).some((alias) => normalizeKey(alias) === key);
  });
};

export const normalizeUnitCode = (unit: string, units?: UnitLike[]) => {
  const list = getUnitList(units);
  return findUnit(unit, list)?.code || unit;
};

export const getUnitGroup = (unit: string, units?: UnitLike[]) => {
  const list = getUnitList(units);
  const found = findUnit(unit, list);
  return found ? found.group : 'other';
};

export const getCompatibleUnits = (unit: string, units?: UnitLike[]) => {
  const list = getUnitList(units);
  const base = findUnit(unit, list);
  if (!base) return [unit];
  return list.filter((entry) => entry.group === base.group).map((entry) => entry.code);
};

export const convertQuantity = (
  value: number,
  fromUnit: string,
  toUnit: string,
  units?: UnitLike[]
) => {
  const list = getUnitList(units);
  const from = findUnit(fromUnit, list);
  const to = findUnit(toUnit, list);
  if (!from || !to) return null;
  if (from.group !== to.group) return null;

  const baseQty = value * from.to_base;
  return baseQty / to.to_base;
};
