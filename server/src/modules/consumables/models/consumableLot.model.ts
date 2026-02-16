// @ts-nocheck
import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from '../../../models/base';

const HOLDER_TYPES = ['STORE', 'OFFICE'] as const;
const QTY_FACTOR = 100;
const QTY_EPSILON = 1e-8;

const roundQty = (q: number) => Math.round(q * QTY_FACTOR) / QTY_FACTOR;

function hasAtMostTwoDecimals(value: number) {
  return Math.abs(value * QTY_FACTOR - Math.round(value * QTY_FACTOR)) < QTY_EPSILON;
}

function normalizePositiveQty(value: unknown, field: string, allowZero = false) {
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

function quantitySetter(field: string, allowZero = false) {
  return (value: unknown) => {
    if (value === null || value === undefined) return value;
    return normalizePositiveQty(value, field, allowZero);
  };
}

const LotDocsSchema = new Schema<any>(
  {
    sds_url: { type: String, default: null },
    coa_url: { type: String, default: null },
    invoice_url: { type: String, default: null },
  },
  { _id: false }
);

const ConsumableLotSchema = new Schema<any>(
  {
    consumable_id: { type: Schema.Types.ObjectId, ref: 'ConsumableItem', required: true },
    holder_type: { type: String, enum: HOLDER_TYPES, required: true },
    holder_id: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: function (this: any) {
        return this.holder_type === 'STORE' ? 'Store' : 'Office';
      },
    },
    batch_no: { type: String, required: true, trim: true },
    expiry_date: { type: Date, required: true },
    qty_received: { type: Number, required: true, set: quantitySetter('qty_received') },
    qty_available: { type: Number, required: true, set: quantitySetter('qty_available', true) },
    received_at: { type: Date, default: Date.now },
    received_by_user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    notes: { type: String, default: null },
    document_id: { type: Schema.Types.ObjectId, ref: 'Document', default: null },
    supplier_id: { type: Schema.Types.ObjectId, ref: 'ConsumableSupplier', default: null },
    docs: { type: LotDocsSchema, default: () => ({}) },
  },
  baseSchemaOptions
);

function applyQtyUpdateRules(update: any) {
  if (!update || typeof update !== 'object') return;
  const apply = (target: any) => {
    if (!target || typeof target !== 'object') return;
    if (target.qty_received !== undefined) {
      target.qty_received = normalizePositiveQty(target.qty_received, 'qty_received');
    }
    if (target.qty_available !== undefined) {
      target.qty_available = normalizePositiveQty(target.qty_available, 'qty_available', true);
    }
  };
  apply(update);
  apply(update.$set);
}

function qtyUpdateHook(this: any, next: (err?: Error) => void) {
  try {
    applyQtyUpdateRules(this.getUpdate?.());
    next();
  } catch (error) {
    next(error as Error);
  }
}

ConsumableLotSchema.pre('updateOne', qtyUpdateHook);
ConsumableLotSchema.pre('updateMany', qtyUpdateHook);
ConsumableLotSchema.pre('findOneAndUpdate', qtyUpdateHook);

ConsumableLotSchema.index({ holder_type: 1, holder_id: 1 });
ConsumableLotSchema.index({ consumable_id: 1 });
ConsumableLotSchema.index({ expiry_date: 1 });
ConsumableLotSchema.index({ batch_no: 1 });
ConsumableLotSchema.index({ supplier_id: 1, expiry_date: 1, received_at: -1 });
ConsumableLotSchema.index({ expiry_date: 1, received_at: -1 });

export const ConsumableLotModel = mongoose.model('ConsumableLot', ConsumableLotSchema);


