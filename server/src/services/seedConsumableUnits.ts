import { ConsumableUnitModel } from '../modules/consumables/models/consumableUnit.model';

const DEFAULT_UNITS = [
  {
    code: 'mg',
    name: 'Milligram',
    group: 'mass',
    to_base: 0.001,
    aliases: ['milligram', 'milligrams'],
  },
  {
    code: 'g',
    name: 'Gram',
    group: 'mass',
    to_base: 1,
    aliases: ['gram', 'grams'],
  },
  {
    code: 'kg',
    name: 'Kilogram',
    group: 'mass',
    to_base: 1000,
    aliases: ['kilogram', 'kilograms'],
  },
  {
    code: 'mL',
    name: 'Milliliter',
    group: 'volume',
    to_base: 1,
    aliases: ['ml', 'millilitre', 'milliliters', 'millilitres', 'cc'],
  },
  {
    code: 'L',
    name: 'Liter',
    group: 'volume',
    to_base: 1000,
    aliases: ['l', 'litre', 'liters', 'litres'],
  },
];

export async function ensureConsumableUnits() {
  if (DEFAULT_UNITS.length === 0) return;

  const operations = DEFAULT_UNITS.map((unit) => ({
    updateOne: {
      filter: { code: unit.code },
      update: { $setOnInsert: { ...unit, is_active: true } },
      upsert: true,
    },
  }));

  await ConsumableUnitModel.bulkWrite(operations, { ordered: false });
}
