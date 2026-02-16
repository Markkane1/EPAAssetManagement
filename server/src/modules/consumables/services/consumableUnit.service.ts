// @ts-nocheck
import type { ClientSession } from 'mongoose';
import { ConsumableUnitModel } from '../models/consumableUnit.model';
import { buildUnitLookup, type UnitLookup } from '../utils/unitConversion';

const CACHE_TTL_MS = 60 * 1000;
let unitCache: { lookup: UnitLookup; fetchedAt: number } | null = null;

export function clearUnitCache() {
  unitCache = null;
}

export async function getUnitLookup(options: { session?: ClientSession; activeOnly?: boolean } = {}) {
  const { session, activeOnly = false } = options;
  if (!session && !activeOnly && unitCache && Date.now() - unitCache.fetchedAt < CACHE_TTL_MS) {
    return unitCache.lookup;
  }

  const filter: Record<string, unknown> = {};
  if (activeOnly) filter.is_active = true;

  const units = await ConsumableUnitModel.find(filter).session(session || null);
  const lookup = buildUnitLookup(
    units.map((unit) => ({
      code: unit.code,
      group: unit.group,
      toBase: unit.to_base,
      aliases: unit.aliases || [],
    }))
  );

  if (!session && !activeOnly) {
    unitCache = { lookup, fetchedAt: Date.now() };
  }

  return lookup;
}

