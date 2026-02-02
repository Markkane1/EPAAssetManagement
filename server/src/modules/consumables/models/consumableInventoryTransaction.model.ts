import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from '../../../models/base';

const ConsumableInventoryTransactionSchema = new Schema(
  {
    tx_type: {
      type: String,
      enum: ['RECEIPT', 'TRANSFER', 'CONSUME', 'ADJUST', 'DISPOSE', 'RETURN', 'OPENING_BALANCE'],
      required: true,
    },
    tx_time: { type: String, required: true },
    created_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    from_location_id: { type: Schema.Types.ObjectId, ref: 'Office', default: null },
    to_location_id: { type: Schema.Types.ObjectId, ref: 'Office', default: null },
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
ConsumableInventoryTransactionSchema.index({ from_location_id: 1 });
ConsumableInventoryTransactionSchema.index({ to_location_id: 1 });
ConsumableInventoryTransactionSchema.index({ lot_id: 1 });

export const ConsumableInventoryTransactionModel = mongoose.model(
  'ConsumableInventoryTransaction',
  ConsumableInventoryTransactionSchema
);
