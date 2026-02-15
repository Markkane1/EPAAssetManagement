import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from '../../../models/base';

const ConsumableContainerSchema = new Schema<any>(
  {
    lot_id: { type: Schema.Types.ObjectId, ref: 'ConsumableLot', required: true },
    container_code: { type: String, required: true, unique: true, trim: true },
    initial_qty_base: { type: Number, required: true, min: 0 },
    current_qty_base: { type: Number, required: true, min: 0 },
    current_location_id: { type: Schema.Types.ObjectId, ref: 'Office', required: true },
    status: {
      type: String,
      enum: ['IN_STOCK', 'EMPTY', 'DISPOSED', 'LOST'],
      default: 'IN_STOCK',
    },
    opened_date: { type: String, default: null },
  },
  baseSchemaOptions
);

ConsumableContainerSchema.index({ lot_id: 1, container_code: 1 });
ConsumableContainerSchema.index({ current_location_id: 1, status: 1, container_code: 1 });
ConsumableContainerSchema.index({ status: 1, container_code: 1 });

export const ConsumableContainerModel = mongoose.model('ConsumableContainer', ConsumableContainerSchema);

