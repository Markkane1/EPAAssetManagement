import { Response, NextFunction } from 'express';
import { ConsumableLotModel } from '../models/consumableLot.model';
import type { AuthRequest } from '../../../middleware/auth';
import { createHttpError } from '../utils/httpError';
import {
  ensureScopeItemAccess,
  resolveConsumableRequestScope,
  resolveScopeLabOnlyRestrictions,
} from '../utils/accessScope';

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseBooleanFlag(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n'].includes(normalized)) return false;
  return fallback;
}

export const consumableLotController = {
  list: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const filter: Record<string, unknown> = {};
      const scope = await resolveConsumableRequestScope(req);
      const requestedHolderType = req.query.holder_type
        ? String(req.query.holder_type).trim().toUpperCase()
        : '';
      const requestedHolderId = req.query.holder_id ? String(req.query.holder_id).trim() : '';

      if (!scope.isGlobal) {
        if (!scope.locationId) {
          throw createHttpError(403, 'User is not assigned to an office');
        }
        if (requestedHolderType && requestedHolderType !== 'OFFICE') {
          throw createHttpError(403, 'User does not have access to this holder type');
        }
        if (requestedHolderId && requestedHolderId !== scope.locationId) {
          throw createHttpError(403, 'User does not have access to this holder');
        }
        filter.holder_type = 'OFFICE';
        filter.holder_id = scope.locationId;
      } else {
        if (requestedHolderType) filter.holder_type = requestedHolderType;
        if (requestedHolderId) filter.holder_id = requestedHolderId;
      }

      if (req.query.consumable_id) {
        const requestedItemId = String(req.query.consumable_id).trim();
        if (!requestedItemId) {
          throw createHttpError(400, 'consumable_id is invalid');
        }
        await ensureScopeItemAccess(scope, requestedItemId);
        filter.consumable_id = requestedItemId;
      } else if (!scope.canAccessLabOnly) {
        const { labOnlyItemIds } = await resolveScopeLabOnlyRestrictions(scope);
        if (labOnlyItemIds.length > 0) {
          filter.consumable_id = { $nin: labOnlyItemIds };
        }
      }
      if (req.query.batch_no) filter.batch_no = req.query.batch_no;
      if (!parseBooleanFlag(req.query.include_zero, false)) {
        (filter as any).$or = [{ qty_available: { $gt: 0 } }, { qty_available: { $exists: false } }];
      }
      const limit = clampInt((req.query as Record<string, unknown>).limit, 500, 1, 2000);
      const page = clampInt((req.query as Record<string, unknown>).page, 1, 1, 100000);
      const skip = (page - 1) * limit;
      const lots = await ConsumableLotModel.find(filter)
        .sort({ expiry_date: 1, received_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      res.json(lots);
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const scope = await resolveConsumableRequestScope(req);
      const lot = await ConsumableLotModel.findById(req.params.id).lean();
      if (!lot) return res.status(404).json({ message: 'Not found' });
      if (!scope.isGlobal) {
        if (!scope.locationId) {
          throw createHttpError(403, 'User is not assigned to an office');
        }
        if (String(lot.holder_type || '').toUpperCase() !== 'OFFICE') {
          throw createHttpError(403, 'User does not have access to this lot');
        }
        if (String(lot.holder_id || '') !== scope.locationId) {
          throw createHttpError(403, 'User does not have access to this lot');
        }
      }
      await ensureScopeItemAccess(scope, String(lot.consumable_id || ''));
      return res.json(lot);
    } catch (error) {
      next(error);
    }
  },
};
