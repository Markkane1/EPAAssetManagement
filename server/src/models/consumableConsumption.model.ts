import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const ConsumableConsumptionSchema = new Schema(
  {
    consumable_id: { type: Schema.Types.ObjectId, ref: 'Consumable', required: true },
    location_id: { type: Schema.Types.ObjectId, ref: 'Office', required: true },
    available_quantity: { type: Number, required: true },
    consumed_quantity: { type: Number, required: true },
    remaining_quantity: { type: Number, required: true },
    consumed_at: { type: String, required: true },
  },
  baseSchemaOptions
);

export const ConsumableConsumptionModel = mongoose.model(
  'ConsumableConsumption',
  ConsumableConsumptionSchema
);
