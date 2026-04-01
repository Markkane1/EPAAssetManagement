import { OfficeModel } from '../models/office.model';
import { DivisionModel } from '../models/division.model';
import { DistrictModel } from '../models/district.model';
import { escapeRegex } from '../utils/requestParsing';

function normalizeName(value: unknown) {
  return String(value || '').trim();
}

async function ensureDivision(divisionName: string) {
  const existing = await DivisionModel.findOne({
    name: new RegExp(`^${escapeRegex(divisionName)}$`, 'i'),
  });

  if (existing) {
    if (existing.is_active === false) {
      existing.is_active = true;
      await existing.save();
    }
    return existing;
  }

  return DivisionModel.create({
    name: divisionName,
    is_active: true,
  });
}

async function ensureDistrict(districtName: string, divisionId: string) {
  const existing = await DistrictModel.findOne({
    division_id: divisionId,
    name: new RegExp(`^${escapeRegex(districtName)}$`, 'i'),
  });

  if (existing) {
    if (existing.is_active === false) {
      existing.is_active = true;
      await existing.save();
    }
    return existing;
  }

  return DistrictModel.create({
    name: districtName,
    division_id: divisionId,
    is_active: true,
  });
}

export async function syncOfficeReferenceData() {
  const offices = await OfficeModel.find(
    { is_active: { $ne: false } },
    { division: 1, district: 1 }
  ).lean();

  const divisionCache = new Map<string, string>();
  const districtCache = new Set<string>();

  const existingDivisions = await DivisionModel.find({}, { _id: 1, name: 1, is_active: 1 }).lean();
  existingDivisions.forEach((division) => {
    divisionCache.set(normalizeName(division.name).toLowerCase(), String(division._id));
  });

  const existingDistricts = await DistrictModel.find({}, { _id: 1, name: 1, division_id: 1, is_active: 1 }).lean();
  existingDistricts.forEach((district) => {
    districtCache.add(`${String(district.division_id)}::${normalizeName(district.name).toLowerCase()}`);
  });

  for (const office of offices) {
    const divisionName = normalizeName(office.division);
    const districtName = normalizeName(office.district);
    if (!divisionName) continue;

    const divisionKey = divisionName.toLowerCase();
    let divisionId = divisionCache.get(divisionKey);
    if (!divisionId) {
      const division = await ensureDivision(divisionName);
      divisionId = String(division._id || division.id);
      divisionCache.set(divisionKey, divisionId);
    }

    if (!districtName) continue;

    const districtKey = `${divisionId}::${districtName.toLowerCase()}`;
    if (districtCache.has(districtKey)) continue;

    await ensureDistrict(districtName, divisionId);
    districtCache.add(districtKey);
  }
}
