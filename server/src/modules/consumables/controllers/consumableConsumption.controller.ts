import mongoose from 'mongoose';
import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../../../middleware/auth';
import { CategoryModel } from '../../../models/category.model';
import { OfficeModel } from '../../../models/office.model';
import { UserModel } from '../../../models/user.model';
import { createHttpError } from '../utils/httpError';
import { ConsumableBalanceModel } from '../models/consumableBalance.model';
import { ConsumableConsumptionModel } from '../models/consumableConsumption.model';
import { ConsumableIssueModel } from '../models/consumableIssue.model';
import { ConsumableItemModel } from '../models/consumableItem.model';
import { ConsumableLotModel } from '../models/consumableLot.model';
import { addOut, roundQty, validateQtyInput } from '../services/balance.service';

type SourceType = 'OFFICE' | 'USER';

function ensureUser(req: AuthRequest) {
  if (!req.user) throw createHttpError(401, 'Unauthorized');
  return req.user;
}

function normalizeSourceType(value: unknown): SourceType {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized !== 'OFFICE' && normalized !== 'USER') {
    throw createHttpError(400, 'source_type must be OFFICE or USER');
  }
  return normalized;
}

function parseConsumedAt(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return new Date();
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw createHttpError(400, 'consumed_at is invalid');
  }
  return parsed;
}

async function resolveCategoryScope(consumableId: string, session: mongoose.ClientSession) {
  const moduleItem = await ConsumableItemModel.findById(consumableId).session(session).lean();
  if (!moduleItem) throw createHttpError(404, 'Consumable item not found');
  const categoryId = (moduleItem as any).category_id;
  if (!categoryId) return 'GENERAL' as const;
  const category = await CategoryModel.findById(categoryId).session(session).lean();
  return ((category as any)?.scope || 'GENERAL') as 'GENERAL' | 'LAB_ONLY';
}

async function ensureSourceExists(sourceType: SourceType, sourceId: string, session: mongoose.ClientSession) {
  if (sourceType === 'OFFICE') {
    const office = await OfficeModel.findById(sourceId).session(session).lean();
    if (!office) throw createHttpError(404, 'Source office not found');
    return;
  }
  const user = await UserModel.findById(sourceId).session(session).lean();
  if (!user) throw createHttpError(404, 'Source user not found');
}

async function ensureCanRecordForSource(
  authUser: { userId: string; role: string; locationId?: string | null },
  sourceType: SourceType,
  sourceId: string,
  session: mongoose.ClientSession
) {
  if (authUser.role === 'org_admin') return;

  if (authUser.role === 'employee') {
    if (sourceType === 'USER' && String(sourceId) === String(authUser.userId)) return;
    throw createHttpError(403, 'Forbidden');
  }

  if (authUser.role !== 'office_head' && authUser.role !== 'caretaker') {
    throw createHttpError(403, 'Forbidden');
  }

  const actorOfficeId = String(authUser.locationId || '').trim();
  if (!actorOfficeId) {
    throw createHttpError(403, 'Forbidden');
  }

  if (sourceType === 'OFFICE') {
    if (String(sourceId) === actorOfficeId) return;
    throw createHttpError(403, 'Forbidden');
  }

  const sourceUser = await UserModel.findById(sourceId).session(session).lean();
  if (!sourceUser) throw createHttpError(404, 'Source user not found');
  const sourceUserOfficeId = String((sourceUser as any).location_id || '').trim();
  if (!sourceUserOfficeId || sourceUserOfficeId !== actorOfficeId) {
    throw createHttpError(403, 'Forbidden');
  }
}

async function resolveIssueLot(
  issueId: string,
  sourceType: SourceType,
  sourceId: string,
  consumableId: string,
  session: mongoose.ClientSession
) {
  const issue = await ConsumableIssueModel.findById(issueId).session(session).lean();
  if (!issue) throw createHttpError(404, 'Issue not found');

  const issueSourceType = String((issue as any).to_type || '').trim().toUpperCase();
  const issueSourceId = String((issue as any).to_id || '').trim();
  if (issueSourceType !== sourceType || issueSourceId !== sourceId) {
    throw createHttpError(400, 'issue_id does not belong to the specified source_type/source_id');
  }

  const lotId = String((issue as any).lot_id || '').trim();
  if (!lotId) throw createHttpError(400, 'Issue is missing lot_id');

  const lot = await ConsumableLotModel.findById(lotId).session(session).lean();
  if (!lot) throw createHttpError(404, 'Issue lot not found');
  const issueConsumableId = String((lot as any).consumable_id || '').trim();
  if (!issueConsumableId) throw createHttpError(400, 'Issue lot consumable is not configured');
  if (issueConsumableId !== consumableId) {
    throw createHttpError(400, 'issue_id consumable does not match consumable_id');
  }

  return lotId;
}

export const consumableConsumptionController = {
  create: async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    let responseBody: any;
    try {
      await session.withTransaction(async () => {
        const authUser = ensureUser(req);

        const sourceType = normalizeSourceType(req.body?.source_type);
        const sourceId = String(req.body?.source_id || '').trim();
        const consumableId = String(req.body?.consumable_id || '').trim();
        const issueId = req.body?.issue_id ? String(req.body.issue_id).trim() : '';
        if (!sourceId) throw createHttpError(400, 'source_id is required');
        if (!consumableId) throw createHttpError(400, 'consumable_id is required');

        const quantity = roundQty(validateQtyInput(Number(req.body?.quantity)));
        const consumedAt = parseConsumedAt(req.body?.consumed_at);

        await ensureCanRecordForSource(authUser, sourceType, sourceId, session);
        await ensureSourceExists(sourceType, sourceId, session);

        const scope = await resolveCategoryScope(consumableId, session);
        if (scope === 'LAB_ONLY' && !issueId) {
          throw createHttpError(400, 'issue_id is required for LAB_ONLY consumables');
        }

        let lotId: string | null = null;
        if (issueId) {
          lotId = await resolveIssueLot(issueId, sourceType, sourceId, consumableId, session);
        }

        const existingBalance = await ConsumableBalanceModel.findOne({
          holder_type: sourceType,
          holder_id: sourceId,
          consumable_id: consumableId,
        })
          .session(session)
          .lean();
        if (!existingBalance) {
          throw createHttpError(400, 'Insufficient balance: no balance exists for source and consumable');
        }
        const qtyOnHand = Number((existingBalance as any).qty_on_hand || 0);
        if (qtyOnHand < quantity) {
          throw createHttpError(400, 'Insufficient balance: qty_on_hand is less than requested quantity');
        }

        const createdRows = await ConsumableConsumptionModel.create(
          [
            {
              source_type: sourceType,
              source_id: sourceId,
              consumable_id: consumableId,
              quantity,
              consumed_at: consumedAt,
              recorded_by_user_id: authUser.userId,
              issue_id: issueId || null,
              lot_id: lotId,
              notes: req.body?.notes || null,
            },
          ],
          { session }
        );
        const consumption = createdRows[0];

        const balanceResult = await addOut(
          {
            holder_type: sourceType,
            holder_id: sourceId,
            consumable_id: consumableId,
          },
          quantity,
          {
            event_type: 'CONSUME_OUT',
            consumption_id: consumption.id,
            issue_id: issueId || null,
            lot_id: lotId,
            performed_by_user_id: authUser.userId,
            notes: req.body?.notes || null,
          },
          session
        );

        responseBody = {
          consumption,
          balance: balanceResult.balance,
          ledger_txn: balanceResult.txn,
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
