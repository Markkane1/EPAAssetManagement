import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from '../../../models/base';

const HOLDER_TYPES = ['OFFICE', 'USER'] as const;
const QTY_FACTOR = 100;
const QTY_EPSILON = 1e-8;

const roundQty = (q: number) => Math.round(q * QTY_FACTOR) / QTY_FACTOR;

function hasAtMostTwoDecimals(value: number) {
  return Math.abs(value * QTY_FACTOR - Math.round(value * QTY_FACTOR)) < QTY_EPSILON;
}

function normalizeQty(value: unknown, field: string, allowZero: boolean) {
  const qty = Number(value);
  if (!Number.isFinite(qty)) {
    throw new Error(`${field} must be a valid number`);
  }
  if (allowZero ? qty < 0 : qty <= 0) {
    throw new Error(`${field} must be ${allowZero ? 'greater than or equal to 0' : 'greater than 0'}`);
  }
  if (!hasAtMostTwoDecimals(qty)) {
    throw new Error(`${field} must have at most 2 decimal places`);
  }
  return roundQty(qty);
}

function quantitySetter(field: string, allowZero: boolean) {
  return (value: unknown) => {
    if (value === null || value === undefined) return value;
    return normalizeQty(value, field, allowZero);
  };
}

const BALANCE_QTY_FIELDS = ['qty_in_total', 'qty_out_total', 'qty_on_hand'] as const;

function applyBalanceQtyRules(update: any) {
  if (!update || typeof update !== 'object') return;
  const apply = (target: any) => {
    if (!target || typeof target !== 'object') return;
    for (const field of BALANCE_QTY_FIELDS) {
      if (target[field] !== undefined) {
        target[field] = normalizeQty(target[field], field, true);
      }
    }
  };
  apply(update);
  apply(update.$set);
}

function balanceQtyUpdateHook(this: any, next: (err?: Error) => void) {
  try {
    applyBalanceQtyRules(this.getUpdate?.());
    next();
  } catch (error) {
    next(error as Error);
  }
}

const ConsumableBalanceSchema = new Schema<any>(
  {
    holder_type: { type: String, enum: HOLDER_TYPES, required: true },
    holder_id: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: function (this: any) {
        return this.holder_type === 'USER' ? 'User' : 'Office';
      },
    },
    consumable_id: { type: Schema.Types.ObjectId, ref: 'Consumable', required: true },
    qty_in_total: { type: Number, default: 0, set: quantitySetter('qty_in_total', true) },
    qty_out_total: { type: Number, default: 0, set: quantitySetter('qty_out_total', true) },
    qty_on_hand: { type: Number, default: 0, set: quantitySetter('qty_on_hand', true) },
    updated_at: { type: Date, default: Date.now },
  },
  baseSchemaOptions
);

ConsumableBalanceSchema.index({ holder_type: 1, holder_id: 1, consumable_id: 1 }, { unique: true });
ConsumableBalanceSchema.index({ consumable_id: 1 });
ConsumableBalanceSchema.index({ holder_type: 1, holder_id: 1 });

ConsumableBalanceSchema.pre('updateOne', balanceQtyUpdateHook);
ConsumableBalanceSchema.pre('updateMany', balanceQtyUpdateHook);
ConsumableBalanceSchema.pre('findOneAndUpdate', balanceQtyUpdateHook);

export const ConsumableBalanceModel = mongoose.model('ConsumableBalance', ConsumableBalanceSchema);

