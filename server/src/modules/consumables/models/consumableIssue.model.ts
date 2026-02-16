// @ts-nocheck
import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from '../../../models/base';

const FROM_HOLDER_TYPES = ['STORE', 'OFFICE'] as const;
const TO_TYPES = ['OFFICE', 'USER'] as const;
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

const ConsumableIssueSchema = new Schema<any>(
  {
    lot_id: { type: Schema.Types.ObjectId, ref: 'ConsumableLot', required: true },
    from_holder_type: { type: String, enum: FROM_HOLDER_TYPES, required: true },
    from_holder_id: { type: Schema.Types.ObjectId, required: true },
    to_type: { type: String, enum: TO_TYPES, required: true },
    to_id: { type: Schema.Types.ObjectId, required: true },
    quantity: {
      type: Number,
      required: true,
      set: (value: unknown) => {
        if (value === null || value === undefined) return value;
        return normalizeQty(value);
      },
    },
    issued_by_user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    issued_at: { type: Date, default: Date.now },
    notes: { type: String, default: null },
    document_id: { type: Schema.Types.ObjectId, ref: 'Document', default: null },
  },
  baseSchemaOptions
);

ConsumableIssueSchema.pre('updateOne', function (next) {
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
});

ConsumableIssueSchema.pre('updateMany', function (next) {
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
});

ConsumableIssueSchema.pre('findOneAndUpdate', function (next) {
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
});

ConsumableIssueSchema.index({ lot_id: 1, issued_at: -1 });
ConsumableIssueSchema.index({ to_type: 1, to_id: 1, issued_at: -1 });
ConsumableIssueSchema.index({ issued_by_user_id: 1, issued_at: -1 });

export const ConsumableIssueModel = mongoose.model('ConsumableIssue', ConsumableIssueSchema);


