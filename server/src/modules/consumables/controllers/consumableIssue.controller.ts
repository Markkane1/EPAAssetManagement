import mongoose from 'mongoose';
import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../../../middleware/auth';
import { createHttpError } from '../utils/httpError';
import { ConsumableLotModel } from '../models/consumableLot.model';
import { ConsumableIssueModel } from '../models/consumableIssue.model';
import { addIn, roundQty, validateQtyInput } from '../services/balance.service';
import { CategoryModel } from '../../../models/category.model';
import { ConsumableItemModel } from '../models/consumableItem.model';
import { OfficeModel } from '../../../models/office.model';
import { UserModel } from '../../../models/user.model';

const HEAD_OFFICE_ROLE = 'org_admin';

function ensureUser(req: AuthRequest) {
  if (!req.user) throw createHttpError(401, 'Unauthorized');
  return req.user;
}

function ensureIssuePermission(
  user: { role: string; locationId?: string | null },
  lot: { holder_type: 'STORE' | 'OFFICE'; holder_id: unknown }
) {
  if (user.role === HEAD_OFFICE_ROLE) return;
  if (user.role === 'employee') {
    throw createHttpError(403, 'Forbidden');
  }
  if (user.role === 'caretaker' || user.role === 'office_head') {
    if (lot.holder_type === 'OFFICE' && user.locationId && String(lot.holder_id) === String(user.locationId)) {
      return;
    }
    throw createHttpError(403, 'Forbidden');
  }
  throw createHttpError(403, 'Forbidden');
}

async function resolveCategoryScope(consumableId: string, session: mongoose.ClientSession) {
  const moduleItem = await ConsumableItemModel.findById(consumableId).session(session).lean();
  if (!moduleItem) throw createHttpError(404, 'Consumable item not found');
  const categoryId = (moduleItem as any).category_id;
  if (!categoryId) return 'GENERAL';
  const category = await CategoryModel.findById(categoryId).session(session).lean();
  return ((category as any)?.scope || 'GENERAL') as 'GENERAL' | 'LAB_ONLY';
}

async function enforceLabOnlyDestination(
  toType: 'OFFICE' | 'USER',
  toId: string,
  session: mongoose.ClientSession
) {
  if (toType === 'OFFICE') {
    const office = await OfficeModel.findById(toId).session(session).lean();
    if (!office) throw createHttpError(404, 'Destination office not found');
    if ((office as any).type !== 'DISTRICT_LAB') {
      throw createHttpError(400, 'LAB_ONLY consumables can only be issued to DISTRICT_LAB offices');
    }
    return;
  }

  const user = await UserModel.findById(toId).session(session).lean();
  if (!user) throw createHttpError(404, 'Destination user not found');
  if (!(user as any).location_id) {
    throw createHttpError(400, 'Destination user is not assigned to an office');
  }
  const office = await OfficeModel.findById((user as any).location_id).session(session).lean();
  if (!office) throw createHttpError(404, 'Destination user office not found');
  if ((office as any).type !== 'DISTRICT_LAB') {
    throw createHttpError(400, 'LAB_ONLY consumables can only be issued to users in DISTRICT_LAB offices');
  }
}

async function ensureDestinationExists(toType: 'OFFICE' | 'USER', toId: string, session: mongoose.ClientSession) {
  if (toType === 'OFFICE') {
    const office = await OfficeModel.findById(toId).session(session).lean();
    if (!office) throw createHttpError(404, 'Destination office not found');
    return;
  }
  const user = await UserModel.findById(toId).session(session).lean();
  if (!user) throw createHttpError(404, 'Destination user not found');
}

export const consumableIssueController = {
  create: async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    let responseBody: any;
    try {
      await session.withTransaction(async () => {
        const authUser = ensureUser(req);

        const lotId = String(req.body?.lot_id || '').trim();
        const toType = String(req.body?.to_type || '').trim().toUpperCase();
        const toId = String(req.body?.to_id || '').trim();
        if (!lotId) throw createHttpError(400, 'lot_id is required');
        if (!toId) throw createHttpError(400, 'to_id is required');
        if (toType !== 'OFFICE' && toType !== 'USER') {
          throw createHttpError(400, 'to_type must be OFFICE or USER');
        }

        const quantity = roundQty(validateQtyInput(Number(req.body?.quantity)));

        const lot = await ConsumableLotModel.findById(lotId).session(session);
        if (!lot) throw createHttpError(404, 'Lot not found');
        const rawHolderType = String((lot as any).holder_type || '').trim().toUpperCase();
        if (rawHolderType !== 'STORE' && rawHolderType !== 'OFFICE') {
          throw createHttpError(400, 'Lot holder_type is invalid');
        }
        const fromHolderType = rawHolderType as 'STORE' | 'OFFICE';
        const fromHolderId = String((lot as any).holder_id || '').trim();
        if (!fromHolderId) {
          throw createHttpError(400, 'Lot holder is not configured');
        }
        const lotConsumableId = String((lot as any).consumable_id || '').trim();
        if (!lotConsumableId) {
          throw createHttpError(400, 'Lot consumable is not configured');
        }

        ensureIssuePermission(authUser, {
          holder_type: fromHolderType,
          holder_id: fromHolderId,
        });

        const lotAvailable = Number((lot as any).qty_available || 0);
        if (lotAvailable < quantity) {
          throw createHttpError(400, 'Insufficient lot quantity available');
        }

        await ensureDestinationExists(toType as 'OFFICE' | 'USER', toId, session);

        const scope = await resolveCategoryScope(lotConsumableId, session);
        if (scope === 'LAB_ONLY') {
          await enforceLabOnlyDestination(toType as 'OFFICE' | 'USER', toId, session);
        }

        const updatedLot = await ConsumableLotModel.findOneAndUpdate(
          { _id: lot.id, qty_available: { $gte: quantity } },
          [
            {
              $set: {
                qty_available: { $round: [{ $subtract: ['$qty_available', quantity] }, 2] },
              },
            },
          ],
          { new: true, session }
        );
        if (!updatedLot) {
          throw createHttpError(400, 'Insufficient lot quantity available');
        }

        const issueRows = await ConsumableIssueModel.create(
          [
            {
              lot_id: lot.id,
              from_holder_type: fromHolderType,
              from_holder_id: fromHolderId,
              to_type: toType,
              to_id: toId,
              quantity,
              issued_by_user_id: authUser.userId,
              issued_at: new Date(),
              notes: req.body?.notes || null,
              document_id: req.body?.document_id || null,
            },
          ],
          { session }
        );
        const issue = issueRows[0];

        const balanceResult = await addIn(
          {
            holder_type: toType as 'OFFICE' | 'USER',
            holder_id: toId,
            consumable_id: lotConsumableId,
          },
          quantity,
          {
            event_type: 'ISSUE_IN',
            issue_id: issue.id,
            lot_id: lot.id,
            performed_by_user_id: authUser.userId,
            notes: req.body?.notes || null,
          },
          session
        );

        responseBody = {
          issue,
          lot: updatedLot,
          balance: balanceResult.balance,
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
