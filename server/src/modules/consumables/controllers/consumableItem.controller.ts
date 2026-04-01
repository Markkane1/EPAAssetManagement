import { Response, NextFunction } from 'express';
import { ConsumableItemModel } from '../models/consumableItem.model';
import { mapFields, pickDefined } from '../../../utils/mapFields';
import type { AuthRequest } from '../../../middleware/auth';
import { createHttpError } from '../utils/httpError';
import { getUnitLookup } from '../services/consumableUnit.service';
import { normalizeUom } from '../utils/unitConversion';
import {
  ensureScopeCategoryAccess,
  ensureScopeItemAccess,
  resolveConsumableRequestScope,
  resolveScopeLabOnlyRestrictions,
} from '../utils/accessScope';
import { resolveConsumableCategoryScopeByCategoryId } from '../utils/labScope';
import { getRequestContext } from '../../../utils/scope';
import { logAudit } from '../../records/services/audit.service';
import { ensureCategorySelection } from '../../../utils/categoryHierarchy';
import { parseOptionalSubcategory } from '../../../utils/categorySubcategories';

const fieldMap = {
  casNumber: 'cas_number',
  categoryId: 'category_id',
  subcategory: 'subcategory',
  baseUom: 'base_uom',
  isHazardous: 'is_hazardous',
  isControlled: 'is_controlled',
  isChemical: 'is_chemical',
  requiresLotTracking: 'requires_lot_tracking',
  requiresContainerTracking: 'requires_container_tracking',
  defaultMinStock: 'default_min_stock',
  defaultReorderPoint: 'default_reorder_point',
  storageCondition: 'storage_condition',
  createdBy: 'created_by',
};

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildDuplicateNameFilter(options: {
  name: string;
  categoryId?: unknown;
  subcategory?: unknown;
  excludeId?: string;
}) {
  const filter: Record<string, unknown> = {
    name: { $regex: `^${escapeRegex(options.name)}$`, $options: 'i' },
    category_id: options.categoryId || null,
    subcategory: options.subcategory || null,
  };
  if (options.excludeId) {
    filter._id = { $ne: options.excludeId };
  }
  return filter;
}

function buildPayload(body: Record<string, unknown>) {
  const payload = mapFields(body, fieldMap);
  Object.values(fieldMap).forEach((dbKey) => {
    if (body[dbKey] !== undefined) {
      payload[dbKey] = body[dbKey];
    }
  });
  if (body.name !== undefined) payload.name = body.name;
  if (payload.name !== undefined) {
    payload.name = String(payload.name).trim();
  }
  if (payload.category_id === '') payload.category_id = null;
  if (body.subcategory !== undefined) payload.subcategory = parseOptionalSubcategory(body.subcategory);

  if (payload.is_controlled === true && payload.requires_container_tracking === undefined) {
    payload.requires_container_tracking = true;
  }

  return pickDefined(payload);
}

async function ensureConsumableCategorySelection(categoryId: unknown, subcategory: unknown) {
  const { normalizedSubcategory } = await ensureCategorySelection(categoryId, subcategory, 'CONSUMABLE');
  return normalizedSubcategory;
}

async function syncChemicalFlagWithCategoryScope(payload: Record<string, unknown>, fallbackCategoryId?: unknown) {
  const categoryId = payload.category_id !== undefined ? payload.category_id : fallbackCategoryId;
  if (!categoryId) return;
  const scope = await resolveConsumableCategoryScopeByCategoryId(categoryId);
  if (scope === 'LAB_ONLY') {
    payload.is_chemical = true;
  }
}

export const consumableItemController = {
  list: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const scope = await resolveConsumableRequestScope(req);
      const query = req.query as Record<string, unknown>;
      const filter: Record<string, unknown> = {};
      const search = String(query.search || '').trim();
      if (search) {
        const regex = new RegExp(escapeRegex(search), 'i');
        filter.$or = [{ name: regex }, { cas_number: regex }];
      }
      if (!scope.canAccessLabOnly) {
        const { labOnlyCategoryIds } = await resolveScopeLabOnlyRestrictions(scope);
        if (labOnlyCategoryIds.length > 0) {
          filter.category_id = { $nin: labOnlyCategoryIds };
        }
      }
      const limit = clampInt(query.limit, 1000, 1, 2000);
      const page = clampInt(query.page, 1, 1, 100000);
      const skip = (page - 1) * limit;
      const items = await ConsumableItemModel.find(filter)
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean();
      res.json(items);
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const scope = await resolveConsumableRequestScope(req);
      const item = await ConsumableItemModel.findById(req.params.id).lean();
      if (!item) return res.status(404).json({ message: 'Not found' });
      await ensureScopeItemAccess(scope, { category_id: (item as any).category_id });
      return res.json(item);
    } catch (error) {
      next(error);
    }
  },
  create: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const scope = await resolveConsumableRequestScope(req);
      const payload = buildPayload(req.body);
      if (!payload.name) {
        throw createHttpError(400, 'Name is required');
      }
      payload.subcategory = await ensureConsumableCategorySelection(payload.category_id, payload.subcategory);
      await ensureScopeCategoryAccess(scope, payload.category_id);
      if (payload.base_uom) {
        const lookup = await getUnitLookup({ activeOnly: true });
        payload.base_uom = normalizeUom(String(payload.base_uom), lookup);
      } else {
        throw createHttpError(400, 'Base UoM is required');
      }
      await syncChemicalFlagWithCategoryScope(payload);
      if (!payload.created_by && req.user?.userId) {
        payload.created_by = req.user.userId;
      }
      const existing = await ConsumableItemModel.findOne(
        buildDuplicateNameFilter({
          name: String(payload.name),
          categoryId: payload.category_id,
          subcategory: payload.subcategory,
        }),
        { _id: 1 }
      ).lean();
      if (existing?._id) {
        throw createHttpError(409, 'Consumable item already exists in this category/subcategory');
      }
      const item = await ConsumableItemModel.create(payload);
      try {
        const ctx = await getRequestContext(req);
        if (ctx.locationId) {
          await logAudit({ ctx, action: 'CONSUMABLE_ITEM_CREATED', entityType: 'ConsumableItem', entityId: String(item._id), officeId: ctx.locationId });
        }
      } catch { /* audit failures must not surface */ }
      res.status(201).json(item);
    } catch (error) {
      next(error);
    }
  },
  update: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const scope = await resolveConsumableRequestScope(req);
      const existing = await ConsumableItemModel.findById(req.params.id).lean();
      if (!existing) return res.status(404).json({ message: 'Not found' });
      await ensureScopeItemAccess(scope, { category_id: (existing as any).category_id });

      const payload = buildPayload(req.body);
      const nextName = payload.name ? String(payload.name) : String((existing as any).name || '').trim();
      if (payload.category_id !== undefined) {
        await ensureScopeCategoryAccess(scope, payload.category_id);
      }
      if (payload.category_id !== undefined || payload.subcategory !== undefined) {
        payload.subcategory = await ensureConsumableCategorySelection(
          payload.category_id !== undefined ? payload.category_id : existing.category_id,
          payload.subcategory !== undefined ? payload.subcategory : existing.subcategory
        );
      }
      if (payload.base_uom) {
        const lookup = await getUnitLookup({ activeOnly: true });
        payload.base_uom = normalizeUom(String(payload.base_uom), lookup);
      }
      await syncChemicalFlagWithCategoryScope(payload, existing.category_id);
      const duplicate = await ConsumableItemModel.findOne(
        buildDuplicateNameFilter({
          name: nextName,
          categoryId: payload.category_id !== undefined ? payload.category_id : (existing as any).category_id,
          subcategory: payload.subcategory !== undefined ? payload.subcategory : (existing as any).subcategory,
          excludeId: String(req.params.id || ''),
        }),
        { _id: 1 }
      ).lean();
      if (duplicate?._id) {
        throw createHttpError(409, 'Consumable item already exists in this category/subcategory');
      }
      const item = await ConsumableItemModel.findByIdAndUpdate(req.params.id, payload, { new: true });
      if (!item) return res.status(404).json({ message: 'Not found' });
      try {
        const ctx = await getRequestContext(req);
        if (ctx.locationId) {
          await logAudit({ ctx, action: 'CONSUMABLE_ITEM_UPDATED', entityType: 'ConsumableItem', entityId: String(req.params.id), officeId: ctx.locationId });
        }
      } catch { /* audit failures must not surface */ }
      return res.json(item);
    } catch (error) {
      next(error);
    }
  },
  remove: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const scope = await resolveConsumableRequestScope(req);
      const existing = await ConsumableItemModel.findById(req.params.id).lean();
      if (!existing) return res.status(404).json({ message: 'Not found' });
      await ensureScopeItemAccess(scope, { category_id: (existing as any).category_id });
      await ConsumableItemModel.findByIdAndDelete(req.params.id);
      try {
        const ctx = await getRequestContext(req);
        if (ctx.locationId) {
          await logAudit({ ctx, action: 'CONSUMABLE_ITEM_DELETED', entityType: 'ConsumableItem', entityId: String(req.params.id), officeId: ctx.locationId });
        }
      } catch { /* audit failures must not surface */ }
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
