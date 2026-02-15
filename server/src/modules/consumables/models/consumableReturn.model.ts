import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from '../../../models/base';

const RETURN_MODES = ['USER_TO_OFFICE', 'OFFICE_TO_STORE_LOT'] as const;
const QTY_FACTOR = 100;
const QTY_EPSILON = 1e-8;

const roundQty = (q: number) => Math.round(q * QTY_FACTOR) / QTY_FACTOR;

function hasAtMostTwoDecimals(value: number) {
  return Math.abs(value * QTY_FACTOR - Math.round(value * QTY_FACTOR)) < QTY_EPSILON;
}

function normalizeQty(value: unknown) {
  const qty = Number(value);
  if (!Number.isFinite(qty)) {
    throw new Error('quantity must be a valid number');
  }
  if (qty <= 0) {
    throw new Error('quantity must be greater than 0');
  }
  if (!hasAtMostTwoDecimals(qty)) {
    throw new Error('quantity must have at most 2 decimal places');
  }
  return roundQty(qty);
}

const ConsumableReturnSchema = new Schema<any>(
  {
    mode: { type: String, enum: RETURN_MODES, required: true },
    consumable_id: { type: Schema.Types.ObjectId, ref: 'Consumable', required: true },
    quantity: {
      type: Number,
      required: true,
      set: (value: unknown) => {
        if (value === null || value === undefined) return value;
        return normalizeQty(value);
      },
    },
    from_user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    to_office_id: { type: Schema.Types.ObjectId, ref: 'Office', default: null },
    from_office_id: { type: Schema.Types.ObjectId, ref: 'Office', default: null },
    to_lot_id: { type: Schema.Types.ObjectId, ref: 'ConsumableLot', default: null },
    performed_by_user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    performed_at: { type: Date, default: Date.now },
    notes: { type: String, default: null },
  },
  baseSchemaOptions
);

function quantityUpdateHook(this: any, next: (err?: Error) => void) {
  try {
    const update = this.getUpdate?.();
    const apply = (target: any) => {
      if (!target || typeof target !== 'object') return;
      if (target.quantity !== undefined) {
        target.quantity = normalizeQty(target.quantity);
      }
    };
    apply(update);
    apply(update?.$set);
    next();
  } catch (error) {
    next(error as Error);
  }
}

ConsumableReturnSchema.pre('updateOne', quantityUpdateHook);
ConsumableReturnSchema.pre('updateMany', quantityUpdateHook);
ConsumableReturnSchema.pre('findOneAndUpdate', quantityUpdateHook);

ConsumableReturnSchema.index({ mode: 1, performed_at: -1 });
ConsumableReturnSchema.index({ consumable_id: 1, performed_at: -1 });
ConsumableReturnSchema.index({ from_user_id: 1, performed_at: -1 });
ConsumableReturnSchema.index({ to_office_id: 1, performed_at: -1 });
ConsumableReturnSchema.index({ from_office_id: 1, performed_at: -1 });
ConsumableReturnSchema.index({ to_lot_id: 1, performed_at: -1 });
ConsumableReturnSchema.index({ performed_by_user_id: 1, performed_at: -1 });

export const ConsumableReturnModel = mongoose.model('ConsumableReturn', ConsumableReturnSchema);

