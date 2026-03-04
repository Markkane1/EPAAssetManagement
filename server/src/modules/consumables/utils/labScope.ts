import type mongoose from 'mongoose';
import { CategoryModel } from '../../../models/category.model';
import { OfficeModel } from '../../../models/office.model';
import { ConsumableItemModel } from '../models/consumableItem.model';

export type ConsumableCategoryScope = 'GENERAL' | 'LAB_ONLY';

const LAB_ENABLED_OFFICE_TYPES = new Set(['DISTRICT_LAB', 'HEAD_OFFICE']);

function asSession(session?: mongoose.ClientSession) {
  return session || null;
}

export function normalizeOfficeType(value: unknown) {
  return String(value || '').trim().toUpperCase();
}

export function officeTypeSupportsLabOnly(officeType: unknown) {
  return LAB_ENABLED_OFFICE_TYPES.has(normalizeOfficeType(officeType));
}

export function officeSupportsLabOnly(office: { type?: unknown } | null | undefined) {
  if (!office) return false;
  return officeTypeSupportsLabOnly(office.type);
}

export async function resolveOfficeTypeById(officeId: string, session?: mongoose.ClientSession) {
  const office: any = await OfficeModel.findById(officeId, { type: 1 }).session(asSession(session)).lean();
  return normalizeOfficeType(office?.type);
}

export async function resolveConsumableCategoryScopeByCategoryId(
  categoryId: unknown,
  session?: mongoose.ClientSession
): Promise<ConsumableCategoryScope> {
  if (!categoryId) return 'GENERAL';
  const category: any = await CategoryModel.findById(categoryId, { scope: 1 }).session(asSession(session)).lean();
  const scope = String(category?.scope || 'GENERAL').trim().toUpperCase();
  return scope === 'LAB_ONLY' ? 'LAB_ONLY' : 'GENERAL';
}

export async function resolveConsumableCategoryScopeForItem(
  itemOrId:
    | string
    | {
        _id?: unknown;
        id?: unknown;
        category_id?: unknown;
      },
  session?: mongoose.ClientSession
): Promise<ConsumableCategoryScope> {
  if (typeof itemOrId === 'string') {
    const item = await ConsumableItemModel.findById(itemOrId, { category_id: 1 })
      .session(asSession(session))
      .lean();
    return resolveConsumableCategoryScopeByCategoryId(item?.category_id, session);
  }
  return resolveConsumableCategoryScopeByCategoryId(itemOrId?.category_id, session);
}

export async function resolveLabOnlyCategoryIds(session?: mongoose.ClientSession) {
  const categories = await CategoryModel.find(
    { scope: 'LAB_ONLY', asset_type: 'CONSUMABLE' },
    { _id: 1 }
  )
    .session(asSession(session))
    .lean();
  return categories.map((entry) => entry._id);
}

export async function resolveLabOnlyConsumableItemIds(session?: mongoose.ClientSession) {
  const labOnlyCategoryIds = await resolveLabOnlyCategoryIds(session);
  if (labOnlyCategoryIds.length === 0) return [];
  const rows = await ConsumableItemModel.find(
    { category_id: { $in: labOnlyCategoryIds } },
    { _id: 1 }
  )
    .session(asSession(session))
    .lean();
  return rows.map((entry) => entry._id);
}
