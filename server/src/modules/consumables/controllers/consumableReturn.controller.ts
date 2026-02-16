import mongoose from 'mongoose';
import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../../../middleware/auth';
import { CategoryModel } from '../../../models/category.model';
import { OfficeModel } from '../../../models/office.model';
import { StoreModel } from '../../../models/store.model';
import { UserModel } from '../../../models/user.model';
import { createHttpError } from '../utils/httpError';
import { ConsumableBalanceModel } from '../models/consumableBalance.model';
import { ConsumableItemModel } from '../models/consumableItem.model';
import { ConsumableLotModel } from '../models/consumableLot.model';
import { ConsumableReturnModel } from '../models/consumableReturn.model';
import { addIn, addOut, roundQty, validateQtyInput } from '../services/balance.service';

type ReturnMode = 'USER_TO_OFFICE' | 'OFFICE_TO_STORE_LOT';

const HEAD_OFFICE_STORE_CODE = 'HEAD_OFFICE_STORE';

function ensureUser(req: AuthRequest) {
  if (!req.user) throw createHttpError(401, 'Unauthorized');
  return req.user;
}

function normalizeMode(value: unknown): ReturnMode {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized !== 'USER_TO_OFFICE' && normalized !== 'OFFICE_TO_STORE_LOT') {
    throw createHttpError(400, 'mode must be USER_TO_OFFICE or OFFICE_TO_STORE_LOT');
  }
  return normalized;
}

async function resolveCategoryScope(consumableId: string, session: mongoose.ClientSession) {
  const moduleItem = await ConsumableItemModel.findById(consumableId).session(session).lean();
  if (!moduleItem) throw createHttpError(404, 'Consumable item not found');
  const categoryId = (moduleItem as any).category_id;
  if (!categoryId) return 'GENERAL' as const;
  const category = await CategoryModel.findById(categoryId).session(session).lean();
  return ((category as any)?.scope || 'GENERAL') as 'GENERAL' | 'LAB_ONLY';
}

async function ensureSourceBalance(
  holderType: 'USER' | 'OFFICE',
  holderId: string,
  consumableId: string,
  quantity: number,
  session: mongoose.ClientSession
) {
  const balance = await ConsumableBalanceModel.findOne({
    holder_type: holderType,
    holder_id: holderId,
    consumable_id: consumableId,
  })
    .session(session)
    .lean();
  if (!balance) {
    throw createHttpError(400, 'Insufficient balance: no balance exists for source and consumable');
  }
  const qtyOnHand = Number((balance as any).qty_on_hand || 0);
  if (qtyOnHand < quantity) {
    throw createHttpError(400, 'Insufficient balance: qty_on_hand is less than requested quantity');
  }
}

function ensureEmployeeUserToOfficeScope(
  authUser: { userId: string; locationId?: string | null },
  fromUserId: string,
  toOfficeId: string
) {
  const actorOfficeId = String(authUser.locationId || '').trim();
  if (!actorOfficeId) {
    throw createHttpError(403, 'Forbidden');
  }
  if (String(authUser.userId) !== fromUserId) {
    throw createHttpError(403, 'Forbidden');
  }
  if (actorOfficeId !== toOfficeId) {
    throw createHttpError(403, 'Forbidden');
  }
}

function ensureOfficeScopedActorForOffice(
  authUser: { locationId?: string | null },
  officeId: string
) {
  const actorOfficeId = String(authUser.locationId || '').trim();
  if (!actorOfficeId || actorOfficeId !== officeId) {
    throw createHttpError(403, 'Forbidden');
  }
}

async function ensureUserToOfficePermission(
  authUser: { userId: string; role: string; locationId?: string | null },
  fromUser: any,
  toOfficeId: string
) {
  if (authUser.role === 'org_admin') return;

  if (authUser.role === 'employee') {
    ensureEmployeeUserToOfficeScope(authUser, String(fromUser._id), toOfficeId);
    const fromUserOfficeId = String(fromUser.location_id || '').trim();
    if (!fromUserOfficeId || fromUserOfficeId !== toOfficeId) {
      throw createHttpError(403, 'Forbidden');
    }
    return;
  }

  if (authUser.role !== 'office_head' && authUser.role !== 'caretaker') {
    throw createHttpError(403, 'Forbidden');
  }

  ensureOfficeScopedActorForOffice(authUser, toOfficeId);
  const fromUserOfficeId = String(fromUser.location_id || '').trim();
  if (!fromUserOfficeId || fromUserOfficeId !== toOfficeId) {
    throw createHttpError(403, 'Forbidden');
  }
}

function ensureOfficeToStoreLotPermission(
  authUser: { role: string; locationId?: string | null },
  fromOfficeId: string
) {
  if (authUser.role === 'org_admin') return;
  if (authUser.role === 'employee') throw createHttpError(403, 'Forbidden');
  if (authUser.role !== 'office_head' && authUser.role !== 'caretaker') {
    throw createHttpError(403, 'Forbidden');
  }
  ensureOfficeScopedActorForOffice(authUser, fromOfficeId);
}

export const consumableReturnController = {
  create: async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    let responseBody: any;
    try {
      await session.withTransaction(async () => {
        const authUser = ensureUser(req);
        const mode = normalizeMode(req.body?.mode);
        const consumableId = String(req.body?.consumable_id || '').trim();
        if (!consumableId) throw createHttpError(400, 'consumable_id is required');
        const quantity = roundQty(validateQtyInput(Number(req.body?.quantity)));

        // Enforce that target consumable exists and can resolve scope paths.
        await resolveCategoryScope(consumableId, session);

        if (mode === 'USER_TO_OFFICE') {
          const fromUserId = String(req.body?.from_user_id || '').trim();
          const toOfficeId = String(req.body?.to_office_id || '').trim();
          if (!fromUserId) throw createHttpError(400, 'from_user_id is required for USER_TO_OFFICE');
          if (!toOfficeId) throw createHttpError(400, 'to_office_id is required for USER_TO_OFFICE');

          const [fromUser, toOffice] = await Promise.all([
            UserModel.findById(fromUserId).session(session).lean(),
            OfficeModel.findById(toOfficeId).session(session).lean(),
          ]);
          if (!fromUser) throw createHttpError(404, 'Source user not found');
          if (!toOffice) throw createHttpError(404, 'Destination office not found');

          await ensureUserToOfficePermission(authUser, fromUser, toOfficeId);
          await ensureSourceBalance('USER', fromUserId, consumableId, quantity, session);

          const outResult = await addOut(
            {
              holder_type: 'USER',
              holder_id: fromUserId,
              consumable_id: consumableId,
            },
            quantity,
            {
              event_type: 'RETURN_OUT',
              performed_by_user_id: authUser.userId,
              notes: req.body?.notes || null,
            },
            session
          );

          const inResult = await addIn(
            {
              holder_type: 'OFFICE',
              holder_id: toOfficeId,
              consumable_id: consumableId,
            },
            quantity,
            {
              event_type: 'RETURN_IN',
              performed_by_user_id: authUser.userId,
              notes: req.body?.notes || null,
            },
            session
          );

          const returnRows = await ConsumableReturnModel.create(
            [
              {
                mode,
                consumable_id: consumableId,
                quantity,
                from_user_id: fromUserId,
                to_office_id: toOfficeId,
                performed_by_user_id: authUser.userId,
                performed_at: new Date(),
                notes: req.body?.notes || null,
              },
            ],
            { session }
          );

          responseBody = {
            return: returnRows[0],
            source_balance: outResult.balance,
            destination_balance: inResult.balance,
            source_ledger_txn: outResult.txn,
            destination_ledger_txn: inResult.txn,
          };
          return;
        }

        const fromOfficeId = String(req.body?.from_office_id || '').trim();
        const toLotId = String(req.body?.to_lot_id || '').trim();
        if (!fromOfficeId) throw createHttpError(400, 'from_office_id is required for OFFICE_TO_STORE_LOT');
        if (!toLotId) throw createHttpError(400, 'to_lot_id is required for OFFICE_TO_STORE_LOT');

        ensureOfficeToStoreLotPermission(authUser, fromOfficeId);

        const [fromOffice, targetLot, headOfficeStore] = await Promise.all([
          OfficeModel.findById(fromOfficeId).session(session).lean(),
          ConsumableLotModel.findById(toLotId).session(session),
          StoreModel.findOne({ code: HEAD_OFFICE_STORE_CODE, is_active: { $ne: false } }).session(session).lean(),
        ]);
        if (!fromOffice) throw createHttpError(404, 'Source office not found');
        if (!targetLot) throw createHttpError(404, 'Destination lot not found');
        if (!headOfficeStore) throw createHttpError(500, 'HEAD_OFFICE_STORE is not configured');

        const lotHolderType = String((targetLot as any).holder_type || '').trim().toUpperCase();
        const lotHolderId = String((targetLot as any).holder_id || '').trim();
        if (lotHolderType !== 'STORE' || lotHolderId !== String((headOfficeStore as any)._id)) {
          throw createHttpError(400, 'to_lot_id must belong to HEAD_OFFICE_STORE');
        }

        const lotConsumableId = String((targetLot as any).consumable_id || '').trim();
        if (!lotConsumableId || lotConsumableId !== consumableId) {
          throw createHttpError(400, 'to_lot_id consumable does not match consumable_id');
        }

        await ensureSourceBalance('OFFICE', fromOfficeId, consumableId, quantity, session);

        const outResult = await addOut(
          {
            holder_type: 'OFFICE',
            holder_id: fromOfficeId,
            consumable_id: consumableId,
          },
          quantity,
          {
            event_type: 'RETURN_OUT',
            performed_by_user_id: authUser.userId,
            lot_id: targetLot.id,
            notes: req.body?.notes || null,
          },
          session
        );

        const updatedLot = await ConsumableLotModel.findOneAndUpdate(
          { _id: targetLot.id },
          [
            {
              $set: {
                qty_available: { $round: [{ $add: [{ $ifNull: ['$qty_available', 0] }, quantity] }, 2] },
              },
            },
          ],
          { new: true, session }
        );
        if (!updatedLot) {
          throw createHttpError(404, 'Destination lot not found');
        }

        const returnRows = await ConsumableReturnModel.create(
          [
            {
              mode,
              consumable_id: consumableId,
              quantity,
              from_office_id: fromOfficeId,
              to_lot_id: toLotId,
              performed_by_user_id: authUser.userId,
              performed_at: new Date(),
              notes: req.body?.notes || null,
            },
          ],
          { session }
        );

        responseBody = {
          return: returnRows[0],
          source_balance: outResult.balance,
          source_ledger_txn: outResult.txn,
          lot: updatedLot,
        };
      });

      return res.status(201).json(responseBody);
    } catch (error) {
      return next(error);
    } finally {
      await session.endSession();
    }
  },
};
