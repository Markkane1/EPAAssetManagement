import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from '../../../models/base';

const ConsumableReasonCodeSchema = new Schema(
  {
    category: { type: String, enum: ['ADJUST', 'DISPOSE'], required: true },
    code: { type: String, required: true },
    description: { type: String, default: null },
  },
  baseSchemaOptions
);

ConsumableReasonCodeSchema.index({ category: 1, code: 1 }, { unique: true });

export const ConsumableReasonCodeModel = mongoose.model(
  'ConsumableReasonCode',
  ConsumableReasonCodeSchema
);
