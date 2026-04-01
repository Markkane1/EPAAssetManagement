import { AssetModel } from '../models/asset.model';
import { CategoryModel } from '../models/category.model';
import { createHttpError } from './httpError';
import { ConsumableItemModel } from '../modules/consumables/models/consumableItem.model';
import { parseOptionalSubcategory, parseSubcategories, sanitizeHierarchyText } from './categorySubcategories';

export async function ensureCategorySelection(
  categoryId: unknown,
  subcategory: unknown,
  assetType: 'ASSET' | 'CONSUMABLE'
) {
  const normalizedSubcategory = parseOptionalSubcategory(subcategory);

  if (!categoryId) {
    if (normalizedSubcategory) {
      throw createHttpError(400, 'subcategory requires a category');
    }
    return { normalizedSubcategory, category: null };
  }

  const category = await CategoryModel.findById(categoryId, { asset_type: 1, subcategories: 1 }).lean<{
    asset_type?: unknown;
    subcategories?: unknown;
  } | null>();

  if (!category) {
    throw createHttpError(400, 'Selected category does not exist');
  }

  const categoryAssetType = String(category.asset_type || 'ASSET').toUpperCase();
  if (categoryAssetType !== assetType) {
    throw createHttpError(
      400,
      assetType === 'ASSET'
        ? 'Selected category is not valid for moveable assets'
        : 'Selected category is not valid for consumables'
    );
  }

  const allowedSubcategories = parseSubcategories(category.subcategories) || [];
  if (normalizedSubcategory && !allowedSubcategories.includes(normalizedSubcategory)) {
    throw createHttpError(400, 'Selected subcategory does not belong to the chosen category');
  }

  return { normalizedSubcategory, category };
}

export async function ensureSubcategoriesNotInUse(categoryId: string, allowedSubcategories: string[]) {
  const disallowedSubcategories = [null, '', ...allowedSubcategories];

  const [assetNames, consumableNames] = await Promise.all([
    AssetModel.distinct('subcategory', {
      category_id: categoryId,
      is_active: { $ne: false },
      subcategory: { $nin: disallowedSubcategories },
    }),
    ConsumableItemModel.distinct('subcategory', {
      category_id: categoryId,
      subcategory: { $nin: disallowedSubcategories },
    }),
  ]);

  const stillInUse = Array.from(
    new Set(
      [...assetNames, ...consumableNames]
        .map((entry) => sanitizeHierarchyText(String(entry || '')))
        .filter(Boolean)
    )
  );

  if (stillInUse.length > 0) {
    throw createHttpError(
      400,
      `Cannot remove subcategories that are already assigned: ${stillInUse.join(', ')}`
    );
  }
}
