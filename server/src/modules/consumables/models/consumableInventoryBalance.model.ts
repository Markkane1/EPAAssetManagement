import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from '../../../models/base';

const ConsumableInventoryBalanceSchema = new Schema(
  {
    location_id: { type: Schema.Types.ObjectId, ref: 'Office', required: true },
    consumable_item_id: { type: Schema.Types.ObjectId, ref: 'ConsumableItem', required: true },
    lot_id: { type: Schema.Types.ObjectId, ref: 'ConsumableLot', default: null },
    qty_on_hand_base: { type: Number, required: true },
    qty_reserved_base: { type: Number, default: 0 },
  },
  baseSchemaOptions
);

ConsumableInventoryBalanceSchema.index({ location_id: 1, consumable_item_id: 1, lot_id: 1 }, { unique: true });

export const ConsumableInventoryBalanceModel = mongoose.model(
  'ConsumableInventoryBalance',
  ConsumableInventoryBalanceSchema
);
