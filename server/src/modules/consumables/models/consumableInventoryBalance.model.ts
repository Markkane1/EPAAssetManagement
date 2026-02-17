import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from '../../../models/base';

const HOLDER_TYPES = ['OFFICE', 'STORE', 'EMPLOYEE', 'SUB_LOCATION'] as const;

const ConsumableInventoryBalanceSchema = new Schema<any>(
  {
    holder_type: { type: String, enum: HOLDER_TYPES, default: null },
    holder_id: { type: Schema.Types.ObjectId, default: null },
    consumable_item_id: { type: Schema.Types.ObjectId, ref: 'ConsumableItem', required: true },
    lot_id: { type: Schema.Types.ObjectId, ref: 'ConsumableLot', default: null },
    qty_on_hand_base: { type: Number, required: true },
    qty_reserved_base: { type: Number, default: 0 },
  },
  baseSchemaOptions
);

ConsumableInventoryBalanceSchema.index(
  { holder_type: 1, holder_id: 1, consumable_item_id: 1, lot_id: 1 },
  { unique: true, partialFilterExpression: { holder_id: { $exists: true, $ne: null } } }
);

export const ConsumableInventoryBalanceModel = mongoose.model(
  'ConsumableInventoryBalance',
  ConsumableInventoryBalanceSchema
);

