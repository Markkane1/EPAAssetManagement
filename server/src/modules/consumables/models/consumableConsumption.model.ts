import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from '../../../models/base';

const SOURCE_TYPES = ['OFFICE', 'USER'] as const;
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

const ConsumableConsumptionSchema = new Schema<any>(
  {
    source_type: { type: String, enum: SOURCE_TYPES, required: true },
    source_id: { type: Schema.Types.ObjectId, required: true },
    consumable_id: { type: Schema.Types.ObjectId, ref: 'Consumable', required: true },
    quantity: {
      type: Number,
      required: true,
      set: (value: unknown) => {
        if (value === null || value === undefined) return value;
        return normalizeQty(value);
      },
    },
    consumed_at: { type: Date, default: Date.now },
    recorded_by_user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    issue_id: { type: Schema.Types.ObjectId, ref: 'ConsumableIssue', default: null },
    lot_id: { type: Schema.Types.ObjectId, ref: 'ConsumableLot', default: null },
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

ConsumableConsumptionSchema.pre('updateOne', quantityUpdateHook);
ConsumableConsumptionSchema.pre('updateMany', quantityUpdateHook);
ConsumableConsumptionSchema.pre('findOneAndUpdate', quantityUpdateHook);

ConsumableConsumptionSchema.index({ source_type: 1, source_id: 1, consumed_at: -1 });
ConsumableConsumptionSchema.index({ consumable_id: 1, consumed_at: -1 });
ConsumableConsumptionSchema.index({ issue_id: 1 });
ConsumableConsumptionSchema.index({ lot_id: 1 });
ConsumableConsumptionSchema.index({ recorded_by_user_id: 1, consumed_at: -1 });

export const ConsumableConsumptionModel = mongoose.model(
  'ConsumableConsumptionLog',
  ConsumableConsumptionSchema
);

