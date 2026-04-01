import { Response, NextFunction } from 'express';
import { ConsumableLotModel } from '../models/consumableLot.model';
import { ConsumableInventoryBalanceModel } from '../models/consumableInventoryBalance.model';
import type { AuthRequest } from '../../../middleware/auth';
import { createHttpError } from '../utils/httpError';
import {
  buildEmployeeScopedBalanceFilter,
  buildOfficeScopedBalanceFilter,
  isHolderInEmployeeScope,
  isHolderInOfficeScope,
  ensureScopeItemAccess,
  resolveConsumableRequestScope,
  resolveEmployeeScopedHolderIds,
  resolveOfficeScopedHolderIds,
  resolveScopeLabOnlyRestrictions,
  type ConsumableHolderType,
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

function withAnd(base: Record<string, unknown>, clause: Record<string, unknown> | null) {
  if (!clause || Object.keys(clause).length === 0) return base;
  if (Object.keys(base).length === 0) return clause;
  return { $and: [base, clause] };
}

function normalizeRequestedHolderType(value: unknown): ConsumableHolderType | '' {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'STORE' || normalized === 'OFFICE' || normalized === 'EMPLOYEE' || normalized === 'SUB_LOCATION') {
    return normalized;
  }
  return '';
}

async function buildScopedBalanceFilter(
  req: AuthRequest,
  scope: Awaited<ReturnType<typeof resolveConsumableRequestScope>>
) {
  let filter: Record<string, unknown> = {};
  const requestedHolderId = req.query.holder_id ? String(req.query.holder_id).trim() : '';
  const requestedHolderType = normalizeRequestedHolderType(req.query.holder_type)
    || (requestedHolderId ? 'OFFICE' : '');

  const requestedHolderFilter = requestedHolderType
    ? requestedHolderId
      ? { holder_type: requestedHolderType, holder_id: requestedHolderId }
      : { holder_type: requestedHolderType }
    : requestedHolderId
      ? { holder_id: requestedHolderId }
      : null;

  if (scope.isGlobal) {
    return withAnd(filter, requestedHolderFilter);
  }

  if (req.user?.role === 'employee') {
    const employeeScope = await resolveEmployeeScopedHolderIds(req.user.userId);
    if (requestedHolderType === 'STORE' || requestedHolderType === 'OFFICE') {
      throw createHttpError(403, 'Employees do not have access to this holder type');
    }
    if (requestedHolderId && requestedHolderType && !isHolderInEmployeeScope(requestedHolderType, requestedHolderId, employeeScope)) {
      throw createHttpError(403, 'User does not have access to this holder');
    }
    filter = withAnd(filter, requestedHolderFilter);
    return withAnd(filter, buildEmployeeScopedBalanceFilter(employeeScope));
  }

  if (!scope.locationId) {
    throw createHttpError(403, 'User is not assigned to an office');
  }

  const officeScope = await resolveOfficeScopedHolderIds(scope.locationId);
  if (requestedHolderType === 'STORE') {
    throw createHttpError(403, 'User does not have access to this holder type');
  }
  if (requestedHolderId && requestedHolderType && !isHolderInOfficeScope(requestedHolderType, requestedHolderId, officeScope)) {
    throw createHttpError(403, 'User does not have access to this holder');
  }
  filter = withAnd(filter, requestedHolderFilter);
  return withAnd(filter, buildOfficeScopedBalanceFilter(officeScope));
}

export const consumableLotController = {
  list: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const scope = await resolveConsumableRequestScope(req);
      let balanceFilter = await buildScopedBalanceFilter(req, scope);

      if (req.query.consumable_id) {
        const requestedItemId = String(req.query.consumable_id).trim();
        if (!requestedItemId) {
          throw createHttpError(400, 'consumable_id is invalid');
        }
        await ensureScopeItemAccess(scope, requestedItemId);
        balanceFilter.consumable_item_id = requestedItemId;
      } else if (!scope.canAccessLabOnly) {
        const { labOnlyItemIds } = await resolveScopeLabOnlyRestrictions(scope);
        if (labOnlyItemIds.length > 0) {
          balanceFilter = withAnd(balanceFilter, { consumable_item_id: { $nin: labOnlyItemIds } });
        }
      }
      if (!parseBooleanFlag(req.query.include_zero, false)) {
        balanceFilter = withAnd(balanceFilter, { qty_on_hand_base: { $gt: 0 } });
      }
      const limit = clampInt((req.query as Record<string, unknown>).limit, 500, 1, 2000);
      const page = clampInt((req.query as Record<string, unknown>).page, 1, 1, 100000);
      const skip = (page - 1) * limit;
      const lotIds = (await ConsumableInventoryBalanceModel.distinct('lot_id', balanceFilter))
        .map((entry) => String(entry || '').trim())
        .filter(Boolean);
      if (lotIds.length === 0) {
        return res.json([]);
      }

      const lotFilter: Record<string, unknown> = { _id: { $in: lotIds } };
      if (req.query.consumable_id) {
        lotFilter.consumable_id = String(req.query.consumable_id).trim();
      }
      if (req.query.batch_no) {
        lotFilter.batch_no = req.query.batch_no;
      }

      const lots = await ConsumableLotModel.find(lotFilter)
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
      await ensureScopeItemAccess(scope, String(lot.consumable_id || ''));
      if (!scope.isGlobal) {
        const balanceFilter = withAnd(
          { lot_id: String((lot as { _id?: unknown })._id || req.params.id) },
          req.user?.role === 'employee'
            ? buildEmployeeScopedBalanceFilter(await resolveEmployeeScopedHolderIds(req.user!.userId))
            : buildOfficeScopedBalanceFilter(await resolveOfficeScopedHolderIds(scope.locationId!))
        );
        const accessibleBalance = await ConsumableInventoryBalanceModel.exists(balanceFilter);
        if (!accessibleBalance) {
          throw createHttpError(403, 'User does not have access to this lot');
        }
      }
      return res.json(lot);
    } catch (error) {
      next(error);
    }
  },
};
