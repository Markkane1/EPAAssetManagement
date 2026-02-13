import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const ConsumableSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    category_id: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    unit: { type: String, required: true, trim: true },
    total_quantity: { type: Number, required: true, min: 0 },
    available_quantity: { type: Number, required: true, min: 0 },
    acquisition_date: { type: String, default: null },
    is_active: { type: Boolean, default: true },
  },
  baseSchemaOptions
);

ConsumableSchema.index({ is_active: 1, category_id: 1 });
ConsumableSchema.index({ created_at: -1 });

export const ConsumableModel = mongoose.model('Consumable', ConsumableSchema);
