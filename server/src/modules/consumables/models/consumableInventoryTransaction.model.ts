import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from '../../../models/base';

const HOLDER_TYPES = ['OFFICE', 'STORE', 'EMPLOYEE', 'SUB_LOCATION'] as const;

const ConsumableInventoryTransactionSchema = new Schema<any>(
  {
    tx_type: {
      type: String,
      enum: ['RECEIPT', 'TRANSFER', 'CONSUME', 'ADJUST', 'DISPOSE', 'RETURN', 'OPENING_BALANCE'],
      required: true,
    },
    tx_time: { type: String, required: true },
    created_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    from_holder_type: { type: String, enum: HOLDER_TYPES, default: null },
    from_holder_id: { type: Schema.Types.ObjectId, default: null },
    to_holder_type: { type: String, enum: HOLDER_TYPES, default: null },
    to_holder_id: { type: Schema.Types.ObjectId, default: null },
    consumable_item_id: { type: Schema.Types.ObjectId, ref: 'ConsumableItem', required: true },
    lot_id: { type: Schema.Types.ObjectId, ref: 'ConsumableLot', default: null },
    container_id: { type: Schema.Types.ObjectId, ref: 'ConsumableContainer', default: null },
    qty_base: { type: Number, required: true, min: 0 },
    entered_qty: { type: Number, required: true, min: 0 },
    entered_uom: { type: String, required: true },
    reason_code_id: { type: Schema.Types.ObjectId, ref: 'ConsumableReasonCode', default: null },
    reference: { type: String, default: null },
    notes: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  baseSchemaOptions
);

ConsumableInventoryTransactionSchema.index({ tx_time: -1 });
ConsumableInventoryTransactionSchema.index({ consumable_item_id: 1 });
ConsumableInventoryTransactionSchema.index({ from_holder_type: 1, from_holder_id: 1 });
ConsumableInventoryTransactionSchema.index({ to_holder_type: 1, to_holder_id: 1 });
ConsumableInventoryTransactionSchema.index({ lot_id: 1 });

export const ConsumableInventoryTransactionModel = mongoose.model(
  'ConsumableInventoryTransaction',
  ConsumableInventoryTransactionSchema
);

