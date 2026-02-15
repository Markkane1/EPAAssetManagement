import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from '../../../models/base';

const ConsumableItemSchema = new Schema<any>(
  {
    name: { type: String, required: true, trim: true },
    cas_number: { type: String, default: null, trim: true },
    category_id: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    base_uom: { type: String, required: true, trim: true },
    is_hazardous: { type: Boolean, default: false },
    is_controlled: { type: Boolean, default: false },
    is_chemical: { type: Boolean, default: false },
    requires_lot_tracking: { type: Boolean, default: true },
    requires_container_tracking: { type: Boolean, default: false },
    default_min_stock: { type: Number, default: null },
    default_reorder_point: { type: Number, default: null },
    storage_condition: { type: String, default: null },
    created_by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  baseSchemaOptions
);

ConsumableItemSchema.index({ name: 1 });
ConsumableItemSchema.index({ category_id: 1, name: 1 });

export const ConsumableItemModel = mongoose.model('ConsumableItem', ConsumableItemSchema);

