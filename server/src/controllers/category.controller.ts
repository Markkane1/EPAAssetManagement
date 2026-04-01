import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { CategoryModel } from '../models/category.model';
import { AssetModel } from '../models/asset.model';
import { AssetItemModel } from '../models/assetItem.model';
import { createHttpError } from '../utils/httpError';
import { readPagination } from '../utils/requestParsing';
import { buildSearchTerms, buildSearchTermsQuery } from '../utils/searchTerms';
import type { AuthRequest } from '../middleware/auth';
import { resolveAccessContext } from '../utils/accessControl';
import { officeAssetItemFilter } from '../utils/assetHolder';
import { ConsumableItemModel } from '../modules/consumables/models/consumableItem.model';
import { ensureSubcategoriesNotInUse } from '../utils/categoryHierarchy';
import { parseSubcategories } from '../utils/categorySubcategories';
import {
  resolveConsumableRequestScope,
} from '../modules/consumables/utils/accessScope';

const CATEGORY_SCOPES = new Set(['GENERAL', 'LAB_ONLY']);
const CATEGORY_ASSET_TYPES = new Set(['ASSET', 'CONSUMABLE']);

function serializeCategory<T extends Record<string, unknown> | null | undefined>(category: T) {
  if (!category) return category;
  return {
    ...category,
    scope: String((category as Record<string, unknown>).scope || 'GENERAL').trim().toUpperCase(),
    asset_type: String((category as Record<string, unknown>).asset_type || 'ASSET').trim().toUpperCase(),
    subcategories: parseSubcategories((category as Record<string, unknown>).subcategories) || [],
  };
}

function sanitizeCategoryText(value: string) {
  return value
    .replace(/on[a-z]+\s*=/gi, '')
    .replace(/javascript:/gi, '')
    .trim();
}

function parseScope(value: unknown, fallback: 'GENERAL' | 'LAB_ONLY' = 'GENERAL') {
  if (value === undefined || value === null || value === '') return fallback;
  const scope = String(value).trim().toUpperCase();
  if (!CATEGORY_SCOPES.has(scope)) {
    throw createHttpError(400, 'scope must be one of: GENERAL, LAB_ONLY');
  }
  return scope as 'GENERAL' | 'LAB_ONLY';
}

function parseAssetType(value: unknown, fallback: 'ASSET' | 'CONSUMABLE' = 'ASSET') {
  if (value === undefined || value === null || value === '') return fallback;
  const assetType = String(value).trim().toUpperCase();
  if (!CATEGORY_ASSET_TYPES.has(assetType)) {
    throw createHttpError(400, 'assetType must be one of: ASSET (Moveable), CONSUMABLE');
  }
  return assetType as 'ASSET' | 'CONSUMABLE';
}

function parseName(value: unknown) {
  const name = sanitizeCategoryText(String(value || ''));
  if (!name) {
    throw createHttpError(400, 'name is required');
  }
  return name;
}

function parseDescription(value: unknown) {
  if (value === undefined) return undefined;
  const description = sanitizeCategoryText(String(value || ''));
  return description || null;
}

function applyConsumableCategoryReadScope(
  filter: Record<string, unknown>,
  scope: { canAccessLabOnly: boolean }
) {
  if (scope.canAccessLabOnly) {
    return filter;
  }
  const exclusions = Array.isArray(filter.$nor)
    ? [...(filter.$nor as Record<string, unknown>[])]
    : [];
  exclusions.push({ scope: 'LAB_ONLY', asset_type: 'CONSUMABLE' });
  filter.$nor = exclusions;
  return filter;
}

function isRestrictedConsumableCategory(
  category: { scope?: unknown; asset_type?: unknown } | null | undefined,
  scope: { canAccessLabOnly: boolean }
) {
  if (scope.canAccessLabOnly) return false;
  const categoryScope = String(category?.scope || 'GENERAL').trim().toUpperCase();
  const assetType = String(category?.asset_type || 'ASSET').trim().toUpperCase();
  return assetType === 'CONSUMABLE' && categoryScope === 'LAB_ONLY';
}

export const categoryController = {
  list: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const query = req.query as Record<string, unknown>;
      const { page, limit, skip } = readPagination(query, { defaultLimit: 200, maxLimit: 1000 });
      const meta = String(query.meta || '').trim() === '1';
      const filter: Record<string, unknown> = {};
      if (query.scope !== undefined) {
        filter.scope = parseScope(query.scope, 'GENERAL');
      }
      if (query.assetType !== undefined || query.asset_type !== undefined) {
        const assetType = parseAssetType(query.assetType ?? query.asset_type, 'ASSET');
        if (assetType === 'ASSET') {
          filter.$or = [{ asset_type: 'ASSET' }, { asset_type: { $exists: false } }];
        } else {
          filter.asset_type = 'CONSUMABLE';
        }
      }
      const search = String(query.search || '').trim();
      if (search) {
        Object.assign(filter, buildSearchTermsQuery(search) || {});
      }
      const consumableScope = await resolveConsumableRequestScope(req);
      applyConsumableCategoryReadScope(filter, consumableScope);

      const categories = await CategoryModel.find(
        filter,
        { name: 1, description: 1, subcategories: 1, scope: 1, asset_type: 1, created_at: 1 }
      )
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean();
      const serializedCategories = categories.map((category) => serializeCategory(category));
      if (!meta) {
        return res.json(serializedCategories);
      }

      const total = await CategoryModel.countDocuments(filter);
      return res.json({
        items: serializedCategories,
        page,
        limit,
        total,
        hasMore: skip + serializedCategories.length < total,
      });
    } catch (error) {
      next(error);
    }
  },
  counts: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const rawIds = String((req.query as Record<string, unknown>).ids || '').trim();
      const categoryIds = rawIds
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => Types.ObjectId.isValid(entry))
        .map((entry) => new Types.ObjectId(entry));

      if (categoryIds.length === 0) {
        return res.json({ assets: {}, consumables: {} });
      }

      const assetCounts: Record<string, number> = {};
      const consumableCounts: Record<string, number> = {};

      const access = await resolveAccessContext(req.user);
      const assetMatch: Record<string, unknown> = {
        category_id: { $in: categoryIds },
        is_active: { $ne: false },
      };

      if (!access.isOrgAdmin) {
        if (!access.officeId) {
          throw createHttpError(403, 'User is not assigned to an office');
        }
        const visibleAssetIds = await AssetItemModel.distinct('asset_id', {
          ...officeAssetItemFilter(access.officeId),
          is_active: { $ne: false },
        });
        if (visibleAssetIds.length === 0) {
          assetMatch._id = { $in: [] };
        } else {
          assetMatch._id = { $in: visibleAssetIds };
        }
      }

      const assetGroups = await AssetModel.aggregate([
        { $match: assetMatch },
        { $group: { _id: '$category_id', count: { $sum: 1 } } },
      ]);
      assetGroups.forEach((entry) => {
        if (entry?._id) {
          assetCounts[String(entry._id)] = Number(entry.count || 0);
        }
      });

      const consumableScope = await resolveConsumableRequestScope(req);
      const consumableMatch: Record<string, unknown> = {
        category_id: { $in: categoryIds },
      };
      if (!consumableScope.canAccessLabOnly) {
        const allowedCategories = await CategoryModel.find(
          { _id: { $in: categoryIds }, $nor: [{ scope: 'LAB_ONLY', asset_type: 'CONSUMABLE' }] },
          { _id: 1 }
        ).lean<{ _id: Types.ObjectId }[]>();
        consumableMatch.category_id = { $in: allowedCategories.map((entry) => entry._id) };
      }

      const scopedCategoryIds = consumableMatch.category_id as { $in: Types.ObjectId[] };
      if (scopedCategoryIds.$in.length > 0) {
        const consumableGroups = await ConsumableItemModel.aggregate([
          { $match: consumableMatch },
          { $group: { _id: '$category_id', count: { $sum: 1 } } },
        ]);
        consumableGroups.forEach((entry) => {
          if (entry?._id) {
            consumableCounts[String(entry._id)] = Number(entry.count || 0);
          }
        });
      }

      return res.json({ assets: assetCounts, consumables: consumableCounts });
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const category = await CategoryModel.findById(req.params.id).lean();
      if (!category) return res.status(404).json({ message: 'Not found' });
      const consumableScope = await resolveConsumableRequestScope(req);
      if (isRestrictedConsumableCategory(category as { scope?: unknown; asset_type?: unknown }, consumableScope)) {
        return res.status(404).json({ message: 'Not found' });
      }
      res.json(serializeCategory(category as Record<string, unknown>));
    } catch (error) {
      next(error);
    }
  },
  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload: Record<string, unknown> = {
        name: parseName((req.body as Record<string, unknown>).name),
        scope: parseScope((req.body as Record<string, unknown>).scope, 'GENERAL'),
        asset_type: parseAssetType(
          (req.body as Record<string, unknown>).assetType ?? (req.body as Record<string, unknown>).asset_type,
          'ASSET'
        ),
      };
      const description = parseDescription((req.body as Record<string, unknown>).description);
      if (description !== undefined) payload.description = description;
      const subcategories = parseSubcategories((req.body as Record<string, unknown>).subcategories);
      if (subcategories !== undefined) payload.subcategories = subcategories;
      payload.search_terms = buildSearchTerms([payload.name, ...(subcategories || [])]);

      const category = await CategoryModel.create(payload);
      res.status(201).json(serializeCategory(category.toObject()));
    } catch (error) {
      next(error);
    }
  },
  update: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as Record<string, unknown>;
      const payload: Record<string, unknown> = {};
      const existing = await CategoryModel.findById(req.params.id, { name: 1, subcategories: 1 }).lean<{
        name?: string;
        subcategories?: string[];
      } | null>();
      if (!existing) return res.status(404).json({ message: 'Not found' });
      if (body.name !== undefined) payload.name = parseName(body.name);
      if (body.description !== undefined) payload.description = parseDescription(body.description);
      if (body.scope !== undefined) payload.scope = parseScope(body.scope);
      if (body.assetType !== undefined || body.asset_type !== undefined) {
        payload.asset_type = parseAssetType(body.assetType ?? body.asset_type);
      }
      if (body.subcategories !== undefined) {
        const subcategories = parseSubcategories(body.subcategories) || [];
        await ensureSubcategoriesNotInUse(String(req.params.id), subcategories);
        payload.subcategories = subcategories;
      }
      payload.search_terms = buildSearchTerms([
        payload.name ?? existing.name,
        ...((payload.subcategories as string[] | undefined) ?? existing.subcategories ?? []),
      ]);

      const category = await CategoryModel.findByIdAndUpdate(req.params.id, payload, {
        new: true,
        runValidators: true,
      });
      if (!category) return res.status(404).json({ message: 'Not found' });
      res.json(serializeCategory(category.toObject()));
    } catch (error) {
      next(error);
    }
  },
  remove: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const category = await CategoryModel.findByIdAndDelete(req.params.id);
      if (!category) return res.status(404).json({ message: 'Not found' });
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
