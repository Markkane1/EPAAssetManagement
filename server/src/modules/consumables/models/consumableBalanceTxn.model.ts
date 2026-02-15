import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from '../../../models/base';

const EVENT_TYPES = ['ISSUE_IN', 'CONSUME_OUT', 'RETURN_OUT', 'RETURN_IN', 'ADJUST_IN', 'ADJUST_OUT'] as const;
const QTY_FACTOR = 100;
const QTY_EPSILON = 1e-8;

const roundQty = (q: number) => Math.round(q * QTY_FACTOR) / QTY_FACTOR;

function hasAtMostTwoDecimals(value: number) {
  return Math.abs(value * QTY_FACTOR - Math.round(value * QTY_FACTOR)) < QTY_EPSILON;
}

function normalizeQty(value: unknown, field: string) {
  const qty = Number(value);
  if (!Number.isFinite(qty)) {
    throw new Error(`${field} must be a valid number`);
  }
  if (qty <= 0) {
    throw new Error(`${field} must be greater than 0`);
  }
  if (!hasAtMostTwoDecimals(qty)) {
    throw new Error(`${field} must have at most 2 decimal places`);
  }
  return roundQty(qty);
}

function quantitySetter(field: string) {
  return (value: unknown) => {
    if (value === null || value === undefined) return value;
    return normalizeQty(value, field);
  };
}

function applyTxnQtyRules(update: any) {
  if (!update || typeof update !== 'object') return;
  const apply = (target: any) => {
    if (!target || typeof target !== 'object') return;
    if (target.quantity !== undefined) {
      target.quantity = normalizeQty(target.quantity, 'quantity');
    }
  };
  apply(update);
  apply(update.$set);
}

function txnQtyUpdateHook(this: any, next: (err?: Error) => void) {
  try {
    applyTxnQtyRules(this.getUpdate?.());
    next();
  } catch (error) {
    next(error as Error);
  }
}

const ConsumableBalanceTxnSchema = new Schema<any>(
  {
    balance_id: { type: Schema.Types.ObjectId, ref: 'ConsumableBalance', required: true },
    event_type: { type: String, enum: EVENT_TYPES, required: true },
    quantity: { type: Number, required: true, set: quantitySetter('quantity') },
    issue_id: { type: Schema.Types.ObjectId, default: null },
    lot_id: { type: Schema.Types.ObjectId, default: null },
    consumption_id: { type: Schema.Types.ObjectId, default: null },
    performed_by_user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    performed_at: { type: Date, default: Date.now },
    notes: { type: String, default: null },
  },
  baseSchemaOptions
);

ConsumableBalanceTxnSchema.index({ balance_id: 1, performed_at: -1 });
ConsumableBalanceTxnSchema.index({ event_type: 1 });
ConsumableBalanceTxnSchema.index({ issue_id: 1 });
ConsumableBalanceTxnSchema.index({ lot_id: 1 });
ConsumableBalanceTxnSchema.index({ consumption_id: 1 });

ConsumableBalanceTxnSchema.pre('updateOne', txnQtyUpdateHook);
ConsumableBalanceTxnSchema.pre('updateMany', txnQtyUpdateHook);
ConsumableBalanceTxnSchema.pre('findOneAndUpdate', txnQtyUpdateHook);

export const ConsumableBalanceTxnModel = mongoose.model('ConsumableBalanceTxn', ConsumableBalanceTxnSchema);

