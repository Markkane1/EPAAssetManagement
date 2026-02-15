import mongoose, { ClientSession } from 'mongoose';
import { ConsumableBalanceModel } from '../models/consumableBalance.model';
import { ConsumableBalanceTxnModel } from '../models/consumableBalanceTxn.model';
import { createHttpError } from '../utils/httpError';

const HOLDER_TYPES = ['OFFICE', 'USER'] as const;
const IN_EVENT_TYPES = ['ISSUE_IN', 'RETURN_IN', 'ADJUST_IN'] as const;
const OUT_EVENT_TYPES = ['CONSUME_OUT', 'RETURN_OUT', 'ADJUST_OUT'] as const;
const QTY_FACTOR = 100;
const QTY_EPSILON = 1e-8;

export type BalanceHolderType = (typeof HOLDER_TYPES)[number];
export type BalanceInEventType = (typeof IN_EVENT_TYPES)[number];
export type BalanceOutEventType = (typeof OUT_EVENT_TYPES)[number];
export type BalanceEventType = BalanceInEventType | BalanceOutEventType;

type BalanceKey = {
  holder_type: BalanceHolderType;
  holder_id: string;
  consumable_id: string;
};

type BalanceTxnMeta<TEvent extends BalanceEventType = BalanceEventType> = {
  event_type: TEvent;
  issue_id?: string | null;
  lot_id?: string | null;
  consumption_id?: string | null;
  performed_by_user_id: string;
  notes?: string | null;
};

type BalanceWriteResult = {
  balance: any;
  txn: any;
};

const isHolderType = (value: string): value is BalanceHolderType =>
  HOLDER_TYPES.includes(value as BalanceHolderType);

const isInEventType = (value: string): value is BalanceInEventType =>
  IN_EVENT_TYPES.includes(value as BalanceInEventType);

const isOutEventType = (value: string): value is BalanceOutEventType =>
  OUT_EVENT_TYPES.includes(value as BalanceOutEventType);

function normalizeHolderType(holderType: unknown): BalanceHolderType {
  const normalized = String(holderType || '').trim().toUpperCase();
  if (!isHolderType(normalized)) {
    throw createHttpError(400, 'holder_type must be OFFICE or USER');
  }
  return normalized;
}

function normalizeBalanceKey(key: BalanceKey): BalanceKey {
  const holderType = normalizeHolderType(key.holder_type);
  const holderId = String(key.holder_id || '').trim();
  const consumableId = String(key.consumable_id || '').trim();
  if (!holderId) throw createHttpError(400, 'holder_id is required');
  if (!consumableId) throw createHttpError(400, 'consumable_id is required');
  return {
    holder_type: holderType,
    holder_id: holderId,
    consumable_id: consumableId,
  };
}

export function validateQtyInput(q: unknown) {
  if (typeof q !== 'number' || !Number.isFinite(q)) {
    throw createHttpError(400, 'Quantity must be a valid number');
  }
  if (q <= 0) {
    throw createHttpError(400, 'Quantity must be greater than 0');
  }
  const scaled = q * QTY_FACTOR;
  if (Math.abs(scaled - Math.round(scaled)) > QTY_EPSILON) {
    throw createHttpError(400, 'Quantity must have at most 2 decimal places');
  }
  return q;
}

export function roundQty(q: number) {
  return Math.round(q * QTY_FACTOR) / QTY_FACTOR;
}

async function withTxn<T>(handler: (session: ClientSession) => Promise<T>, session?: ClientSession) {
  if (session) return handler(session);
  const ownedSession = await mongoose.startSession();
  try {
    let result!: T;
    await ownedSession.withTransaction(async () => {
      result = await handler(ownedSession);
    });
    return result;
  } finally {
    await ownedSession.endSession();
  }
}

export async function upsertBalance(
  holder_type: BalanceHolderType,
  holder_id: string,
  consumable_id: string,
  session?: ClientSession
) {
  const key = normalizeBalanceKey({ holder_type, holder_id, consumable_id });
  return ConsumableBalanceModel.findOneAndUpdate(
    key,
    {
      $setOnInsert: {
        ...key,
        qty_in_total: 0,
        qty_out_total: 0,
        qty_on_hand: 0,
      },
      $set: { updated_at: new Date() },
    },
    { new: true, upsert: true, session, runValidators: true }
  );
}

export async function addIn(
  keyInput: BalanceKey,
  qtyInput: number,
  meta: BalanceTxnMeta<BalanceInEventType>,
  session?: ClientSession
): Promise<BalanceWriteResult> {
  return withTxn(async (txSession) => {
    const key = normalizeBalanceKey(keyInput);
    const qty = roundQty(validateQtyInput(qtyInput));
    if (!isInEventType(meta.event_type)) {
      throw createHttpError(400, 'Invalid event_type for addIn');
    }

    const upserted = await upsertBalance(key.holder_type, key.holder_id, key.consumable_id, txSession);
    if (!upserted) throw createHttpError(500, 'Failed to initialize balance');

    const updatedBalance = await ConsumableBalanceModel.findByIdAndUpdate(
      upserted._id,
      {
        $inc: { qty_in_total: qty, qty_on_hand: qty },
        $set: { updated_at: new Date() },
      },
      { new: true, session: txSession, runValidators: true }
    );
    if (!updatedBalance) throw createHttpError(500, 'Failed to update balance');

    const createdTx = await ConsumableBalanceTxnModel.create(
      [
        {
          balance_id: updatedBalance._id,
          event_type: meta.event_type,
          quantity: qty,
          issue_id: meta.issue_id || null,
          lot_id: meta.lot_id || null,
          consumption_id: meta.consumption_id || null,
          performed_by_user_id: meta.performed_by_user_id,
          notes: meta.notes || null,
        },
      ],
      { session: txSession }
    );

    return { balance: updatedBalance, txn: createdTx[0] };
  }, session);
}

export async function addOut(
  keyInput: BalanceKey,
  qtyInput: number,
  meta: BalanceTxnMeta<BalanceOutEventType>,
  session?: ClientSession
): Promise<BalanceWriteResult> {
  return withTxn(async (txSession) => {
    const key = normalizeBalanceKey(keyInput);
    const qty = roundQty(validateQtyInput(qtyInput));
    if (!isOutEventType(meta.event_type)) {
      throw createHttpError(400, 'Invalid event_type for addOut');
    }

    await upsertBalance(key.holder_type, key.holder_id, key.consumable_id, txSession);

    const updatedBalance = await ConsumableBalanceModel.findOneAndUpdate(
      {
        ...key,
        qty_on_hand: { $gte: qty },
      },
      {
        $inc: { qty_out_total: qty, qty_on_hand: -qty },
        $set: { updated_at: new Date() },
      },
      { new: true, session: txSession, runValidators: true }
    );

    if (!updatedBalance) {
      throw createHttpError(400, 'Insufficient balance: qty_on_hand is less than requested quantity');
    }

    const createdTx = await ConsumableBalanceTxnModel.create(
      [
        {
          balance_id: updatedBalance._id,
          event_type: meta.event_type,
          quantity: qty,
          issue_id: meta.issue_id || null,
          lot_id: meta.lot_id || null,
          consumption_id: meta.consumption_id || null,
          performed_by_user_id: meta.performed_by_user_id,
          notes: meta.notes || null,
        },
      ],
      { session: txSession }
    );

    return { balance: updatedBalance, txn: createdTx[0] };
  }, session);
}

export const balanceService = {
  validateQtyInput,
  roundQty,
  upsertBalance,
  addIn,
  addOut,
};

