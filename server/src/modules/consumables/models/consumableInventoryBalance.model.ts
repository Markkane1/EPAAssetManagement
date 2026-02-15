import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from '../../../models/base';

const HOLDER_TYPES = ['OFFICE', 'STORE'] as const;
const baseTransform = (baseSchemaOptions.toJSON as any)?.transform;

const ConsumableInventoryBalanceSchema = new Schema<any>(
  {
    holder_type: { type: String, enum: HOLDER_TYPES, default: null },
    holder_id: { type: Schema.Types.ObjectId, default: null },
    // Deprecated compatibility field.
    location_id: { type: Schema.Types.ObjectId, ref: 'Office', default: null },
    consumable_item_id: { type: Schema.Types.ObjectId, ref: 'ConsumableItem', required: true },
    lot_id: { type: Schema.Types.ObjectId, ref: 'ConsumableLot', default: null },
    qty_on_hand_base: { type: Number, required: true },
    qty_reserved_base: { type: Number, default: 0 },
  },
  {
    ...baseSchemaOptions,
    toJSON: {
      ...(baseSchemaOptions.toJSON || {}),
      transform: (doc: unknown, ret: Record<string, unknown>) => {
        if (typeof baseTransform === 'function') baseTransform(doc, ret);
        if ((!ret.location_id || ret.location_id === null) && ret.holder_type === 'OFFICE' && ret.holder_id) {
          ret.location_id = ret.holder_id;
        }
      },
    },
  }
);

ConsumableInventoryBalanceSchema.index(
  { holder_type: 1, holder_id: 1, consumable_item_id: 1, lot_id: 1 },
  { unique: true, partialFilterExpression: { holder_id: { $exists: true, $ne: null } } }
);
ConsumableInventoryBalanceSchema.index({ location_id: 1, consumable_item_id: 1, lot_id: 1 });

export const ConsumableInventoryBalanceModel = mongoose.model(
  'ConsumableInventoryBalance',
  ConsumableInventoryBalanceSchema
);

