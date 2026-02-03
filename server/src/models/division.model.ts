import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const DivisionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    is_active: { type: Boolean, default: true },
  },
  baseSchemaOptions
);

DivisionSchema.index({ name: 1 }, { unique: true });

export const DivisionModel = mongoose.model('Division', DivisionSchema);
