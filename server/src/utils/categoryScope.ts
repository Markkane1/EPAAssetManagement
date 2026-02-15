import { AssetModel } from '../models/asset.model';
import { CategoryModel } from '../models/category.model';
import { OfficeModel } from '../models/office.model';
import { createHttpError } from './httpError';

const LAB_OFFICE_TYPES = new Set(['DISTRICT_LAB']);

export const LAB_ONLY_CATEGORY_ERROR_MESSAGE =
  'LAB_ONLY category assets can only be used in DISTRICT_LAB offices.';

function normalizeOfficeType(value: unknown) {
  return String(value || '').trim().toUpperCase();
}

export async function enforceAssetCategoryScopeForOffice(assetId: string, officeId: string) {
  const asset = await AssetModel.findById(assetId, { category_id: 1 }).lean();
  if (!asset) {
    throw createHttpError(404, 'Asset not found');
  }

  if (!asset.category_id) {
    return;
  }

  const category = await CategoryModel.findById(asset.category_id, { scope: 1 }).lean();
  const scope = String(category?.scope || 'GENERAL').toUpperCase();
  if (scope !== 'LAB_ONLY') {
    return;
  }

  const office = await OfficeModel.findById(officeId, { type: 1 }).lean();
  if (!office) {
    throw createHttpError(404, 'Office not found');
  }

  const officeType = normalizeOfficeType(office.type);
  if (!LAB_OFFICE_TYPES.has(officeType)) {
    throw createHttpError(400, LAB_ONLY_CATEGORY_ERROR_MESSAGE);
  }
}
