import { Response, NextFunction } from 'express';
import { ConsumableContainerModel } from '../models/consumableContainer.model';
import { ConsumableLotModel } from '../models/consumableLot.model';
import { mapFields, pickDefined } from '../../../utils/mapFields';
import type { AuthRequest } from '../../../middleware/auth';
import { createHttpError } from '../utils/httpError';
import {
  ensureScopeItemAccess,
  resolveConsumableRequestScope,
  resolveScopeLabOnlyRestrictions,
} from '../utils/accessScope';

const fieldMap = {
  lotId: 'lot_id',
  containerCode: 'container_code',
  initialQtyBase: 'initial_qty_base',
  currentQtyBase: 'current_qty_base',
  currentLocationId: 'current_location_id',
  status: 'status',
  openedDate: 'opened_date',
};

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function buildPayload(body: Record<string, unknown>) {
  const payload = mapFields(body, fieldMap);
  Object.values(fieldMap).forEach((dbKey) => {
    if (body[dbKey] !== undefined) {
      payload[dbKey] = body[dbKey];
    }
  });
  return pickDefined(payload);
}

function validateContainerQuantities(payload: Record<string, unknown>) {
  const initialQty =
    payload.initial_qty_base !== undefined ? Number(payload.initial_qty_base) : null;
  const currentQty =
    payload.current_qty_base !== undefined ? Number(payload.current_qty_base) : null;
  if (initialQty !== null && Number.isFinite(initialQty) && initialQty < 0) {
    throw createHttpError(400, 'initial_qty_base must be greater than or equal to zero');
  }
  if (currentQty !== null && Number.isFinite(currentQty) && currentQty < 0) {
    throw createHttpError(400, 'current_qty_base must be greater than or equal to zero');
  }
  if (
    initialQty !== null &&
    currentQty !== null &&
    Number.isFinite(initialQty) &&
    Number.isFinite(currentQty) &&
    currentQty > initialQty
  ) {
    throw createHttpError(400, 'current_qty_base cannot exceed initial_qty_base');
  }
}

export const consumableContainerController = {
  list: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const scope = await resolveConsumableRequestScope(req);
      const filter: Record<string, unknown> = {};
      const requestedLotId = req.query.lotId ? String(req.query.lotId).trim() : '';
      const requestedLocationId = req.query.locationId ? String(req.query.locationId).trim() : '';

      if (requestedLotId) {
        filter.lot_id = requestedLotId;
        const lot = await ConsumableLotModel.findById(requestedLotId, { consumable_id: 1 }).lean();
        if (lot?.consumable_id) {
          await ensureScopeItemAccess(scope, String(lot.consumable_id));
        }
      } else if (!scope.canAccessLabOnly) {
        const { labOnlyItemIds } = await resolveScopeLabOnlyRestrictions(scope);
        if (labOnlyItemIds.length > 0) {
          const blockedLots = await ConsumableLotModel.find(
            { consumable_id: { $in: labOnlyItemIds } },
            { _id: 1 }
          ).lean();
          if (blockedLots.length > 0) {
            filter.lot_id = { $nin: blockedLots.map((lot) => lot._id) };
          }
        }
      }

      if (!scope.isGlobal) {
        if (!scope.locationId) {
          throw createHttpError(403, 'User is not assigned to an office');
        }
        if (requestedLocationId && requestedLocationId !== scope.locationId) {
          throw createHttpError(403, 'User does not have access to this location');
        }
        filter.current_location_id = scope.locationId;
      } else if (requestedLocationId) {
        filter.current_location_id = requestedLocationId;
      }
      if (req.query.status) filter.status = req.query.status;
      const limit = clampInt((req.query as Record<string, unknown>).limit, 500, 1, 2000);
      const page = clampInt((req.query as Record<string, unknown>).page, 1, 1, 100000);
      const skip = (page - 1) * limit;
      const containers = await ConsumableContainerModel.find(filter)
        .sort({ container_code: 1 })
        .skip(skip)
        .limit(limit)
        .lean();
      res.json(containers);
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const scope = await resolveConsumableRequestScope(req);
      const container = await ConsumableContainerModel.findById(req.params.id).lean();
      if (!container) return res.status(404).json({ message: 'Not found' });
      if (!scope.isGlobal) {
        if (!scope.locationId) {
          throw createHttpError(403, 'User is not assigned to an office');
        }
        if (String(container.current_location_id || '') !== scope.locationId) {
          throw createHttpError(403, 'User does not have access to this container');
        }
      }
      const lot = await ConsumableLotModel.findById(container.lot_id, { consumable_id: 1 }).lean();
      if (!lot) {
        throw createHttpError(404, 'Lot not found');
      }
      await ensureScopeItemAccess(scope, String(lot.consumable_id || ''));
      return res.json(container);
    } catch (error) {
      next(error);
    }
  },
  create: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const scope = await resolveConsumableRequestScope(req);
      const payload = buildPayload(req.body);
      validateContainerQuantities(payload);
      const lotId = payload.lot_id ? String(payload.lot_id) : '';
      if (!lotId) {
        throw createHttpError(400, 'lot_id is required');
      }
      const lot = await ConsumableLotModel.findById(lotId, { consumable_id: 1 }).lean();
      if (!lot) {
        throw createHttpError(404, 'Lot not found');
      }
      await ensureScopeItemAccess(scope, String(lot.consumable_id || ''));
      if (!scope.isGlobal) {
        if (!scope.locationId) {
          throw createHttpError(403, 'User is not assigned to an office');
        }
        if (payload.current_location_id && String(payload.current_location_id) !== scope.locationId) {
          throw createHttpError(403, 'User does not have access to this location');
        }
        payload.current_location_id = scope.locationId;
      }
      const container = await ConsumableContainerModel.create(payload);
      res.status(201).json(container);
    } catch (error) {
      next(error);
    }
  },
  update: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const scope = await resolveConsumableRequestScope(req);
      const existing = await ConsumableContainerModel.findById(req.params.id).lean();
      if (!existing) return res.status(404).json({ message: 'Not found' });
      if (!scope.isGlobal) {
        if (!scope.locationId) {
          throw createHttpError(403, 'User is not assigned to an office');
        }
        if (String(existing.current_location_id || '') !== scope.locationId) {
          throw createHttpError(403, 'User does not have access to this container');
        }
      }
      const existingLot = await ConsumableLotModel.findById(existing.lot_id, { consumable_id: 1 }).lean();
      if (!existingLot) {
        throw createHttpError(404, 'Lot not found');
      }
      await ensureScopeItemAccess(scope, String(existingLot.consumable_id || ''));

      const payload = buildPayload(req.body);
      validateContainerQuantities({
        initial_qty_base:
          payload.initial_qty_base !== undefined ? payload.initial_qty_base : existing.initial_qty_base,
        current_qty_base:
          payload.current_qty_base !== undefined ? payload.current_qty_base : existing.current_qty_base,
      });
      if (payload.lot_id) {
        const updatedLot = await ConsumableLotModel.findById(payload.lot_id, { consumable_id: 1 }).lean();
        if (!updatedLot) {
          throw createHttpError(404, 'Lot not found');
        }
        await ensureScopeItemAccess(scope, String(updatedLot.consumable_id || ''));
      }
      if (!scope.isGlobal) {
        if (payload.current_location_id && String(payload.current_location_id) !== scope.locationId) {
          throw createHttpError(403, 'User does not have access to this location');
        }
      }
      const container = await ConsumableContainerModel.findByIdAndUpdate(req.params.id, payload, { new: true });
      if (!container) return res.status(404).json({ message: 'Not found' });
      return res.json(container);
    } catch (error) {
      next(error);
    }
  },
  remove: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const scope = await resolveConsumableRequestScope(req);
      const existing = await ConsumableContainerModel.findById(req.params.id).lean();
      if (!existing) return res.status(404).json({ message: 'Not found' });
      if (!scope.isGlobal) {
        if (!scope.locationId) {
          throw createHttpError(403, 'User is not assigned to an office');
        }
        if (String(existing.current_location_id || '') !== scope.locationId) {
          throw createHttpError(403, 'User does not have access to this container');
        }
      }
      const lot = await ConsumableLotModel.findById(existing.lot_id, { consumable_id: 1 }).lean();
      if (!lot) {
        throw createHttpError(404, 'Lot not found');
      }
      await ensureScopeItemAccess(scope, String(lot.consumable_id || ''));
      await ConsumableContainerModel.findByIdAndDelete(req.params.id);
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
