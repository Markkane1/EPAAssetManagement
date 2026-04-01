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
import {
  dispatchConsumableWorkflowNotifications,
  resolveOfficeIdsFromHolders,
} from '../services/workflowNotification.service';
import { enforceAccessPolicy, assertLabOnlyOfficeType } from '../../../services/policyEngine.service';
import { enforceApprovalMatrix, markApprovalWorkflowExecuted } from '../../../services/approvalMatrix.service';

function ensureUser(req: AuthRequest) {
  if (!req.user) throw createHttpError(401, 'Unauthorized');
  return req.user;
}

async function ensureIssuePermission(
  user: { userId: string; role: string; roles?: string[]; isOrgAdmin?: boolean; locationId?: string | null },
  lot: { holder_type: 'STORE' | 'OFFICE'; holder_id: unknown }
) {
  await enforceAccessPolicy({
    action: lot.holder_type === 'STORE'
      ? 'consumables.issue.from_store'
      : 'consumables.issue.from_office',
    actor: {
      userId: user.userId,
      role: user.role,
      roles: user.roles || [user.role],
      officeId: user.locationId || null,
      isOrgAdmin: Boolean(user.isOrgAdmin),
    },
    targetOfficeId: lot.holder_type === 'OFFICE' ? String(lot.holder_id || '') : null,
    errorMessage: 'Forbidden',
  });
}

async function resolveCategoryScope(consumableId: string, session?: mongoose.ClientSession) {
  let query = ConsumableItemModel.findById(consumableId).lean();
  if (session) {
    query = query.session(session);
  }
  const moduleItem = await query;
  if (!moduleItem) throw createHttpError(404, 'Consumable item not found');
  const categoryId = (moduleItem as any).category_id;
  if (!categoryId) return 'GENERAL';
  let categoryQuery = CategoryModel.findById(categoryId).lean();
  if (session) {
    categoryQuery = categoryQuery.session(session);
  }
  const category = await categoryQuery;
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
    if ((office as any).is_active === false) {
      throw createHttpError(400, 'Destination office is inactive');
    }
    await assertLabOnlyOfficeType((office as any).type, false);
    return;
  }

  const user = await UserModel.findById(toId).session(session).lean();
  if (!user) throw createHttpError(404, 'Destination user not found');
  if ((user as any).is_active === false) {
    throw createHttpError(400, 'Destination user is inactive');
  }
  if (!(user as any).location_id) {
    throw createHttpError(400, 'Destination user is not assigned to an office');
  }
  const office = await OfficeModel.findById((user as any).location_id).session(session).lean();
  if (!office) throw createHttpError(404, 'Destination user office not found');
  if ((office as any).is_active === false) {
    throw createHttpError(400, 'Destination user office is inactive');
  }
  await assertLabOnlyOfficeType((office as any).type, true);
}

async function ensureDestinationExists(toType: 'OFFICE' | 'USER', toId: string, session: mongoose.ClientSession) {
  if (toType === 'OFFICE') {
    const office = await OfficeModel.findById(toId).session(session).lean();
    if (!office) throw createHttpError(404, 'Destination office not found');
    if ((office as any).is_active === false) {
      throw createHttpError(400, 'Destination office is inactive');
    }
    return;
  }
  const user = await UserModel.findById(toId).session(session).lean();
  if (!user) throw createHttpError(404, 'Destination user not found');
  if ((user as any).is_active === false) {
    throw createHttpError(400, 'Destination user is inactive');
  }
}

async function resolveIssueApprovalGate(input: {
  authUser: { userId: string; role: string; roles?: string[]; isOrgAdmin?: boolean; locationId?: string | null };
  body: Record<string, unknown>;
}) {
  const lotId = String(input.body?.lot_id || '').trim();
  const toType = String(input.body?.to_type || '').trim().toUpperCase();
  const toId = String(input.body?.to_id || '').trim();
  if (!lotId || !toId || (toType !== 'OFFICE' && toType !== 'USER')) {
    return null;
  }
  const quantity = roundQty(validateQtyInput(Number(input.body?.quantity)));
  const lot: any = await ConsumableLotModel.findById(lotId, {
    _id: 1,
    holder_type: 1,
    holder_id: 1,
    consumable_id: 1,
  })
    .lean()
    .exec();
  if (!lot?._id) return null;

  const rawHolderType = String(lot.holder_type || '').trim().toUpperCase();
  if (rawHolderType !== 'STORE' && rawHolderType !== 'OFFICE') return null;
  const fromHolderType = rawHolderType as 'STORE' | 'OFFICE';
  const fromHolderId = String(lot.holder_id || '').trim();
  await ensureIssuePermission(input.authUser, {
    holder_type: fromHolderType,
    holder_id: fromHolderId,
  });

  const consumableId = String(lot.consumable_id || '').trim();
  if (!consumableId) return null;
  const [scope, consumableItem] = await Promise.all([
    resolveCategoryScope(consumableId),
    ConsumableItemModel.findById(consumableId, { _id: 1, is_chemical: 1 }).lean().exec(),
  ]);
  const riskTags: string[] = [];
  if (scope === 'LAB_ONLY') riskTags.push('LAB_ONLY');
  if (Boolean((consumableItem as any)?.is_chemical)) riskTags.push('CHEMICAL');

  const approvalWorkflowId = String(
    input.body.approval_workflow_id || input.body.approvalWorkflowId || ''
  ).trim();
  return enforceApprovalMatrix({
    transactionType: 'CONSUMABLE_ISSUE',
    makerUserId: input.authUser.userId,
    makerRoles: input.authUser.roles || [input.authUser.role],
    makerOfficeId: fromHolderType === 'OFFICE' ? fromHolderId : input.authUser.locationId || null,
    amount: quantity,
    riskTags,
    entityType: 'ConsumableItem',
    entityId: consumableId,
    payloadDigestInput: {
      lotId,
      toType,
      toId,
      quantity,
      riskTags,
    },
    approvalWorkflowId: approvalWorkflowId || null,
  });
}

export const consumableIssueController = {
  create: async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    let responseBody: any;
    let approvalWorkflowToExecute: string | null = null;
    let notificationMeta: {
      consumableId: string;
      holders: Array<{ holderType: string; holderId: string }>;
      actorUserId: string;
    } | null = null;
    try {
      const authUser = ensureUser(req);
      const approvalGate = await resolveIssueApprovalGate({
        authUser,
        body: (req.body || {}) as Record<string, unknown>,
      });
      if (approvalGate?.status === 'pending') {
        return res.status(409).json({
          message: 'Approval workflow is required before issuing this consumable',
          details: { approval_request: approvalGate.request },
        });
      }
      if (approvalGate?.status === 'approved') {
        approvalWorkflowToExecute = approvalGate.workflowIdToExecute;
      }

      await session.withTransaction(async () => {
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

        await ensureIssuePermission(authUser, {
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
        notificationMeta = {
          consumableId: lotConsumableId,
          holders: [
            { holderType: fromHolderType, holderId: fromHolderId },
            { holderType: toType, holderId: toId },
          ],
          actorUserId: authUser.userId,
        };
      });

      if (notificationMeta) {
        const officeIds = await resolveOfficeIdsFromHolders(notificationMeta.holders);
        await dispatchConsumableWorkflowNotifications({
          officeIds,
          consumableItemIds: [notificationMeta.consumableId],
          type: 'CONSUMABLE_ISSUED',
          title: 'Consumable Issued',
          message: 'Consumable stock was issued from lot inventory.',
          includeUserIds: [notificationMeta.actorUserId],
          excludeUserIds: [notificationMeta.actorUserId],
        });
      }
      if (approvalWorkflowToExecute) {
        await markApprovalWorkflowExecuted(approvalWorkflowToExecute);
      }

      return res.status(201).json(responseBody);
    } catch (error) {
      return next(error);
    } finally {
      await session.endSession();
    }
  },
};
