import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const DivisionSchema = new Schema<any>(
  {
    name: { type: String, required: true, trim: true },
    is_active: { type: Boolean, default: true },
  },
  baseSchemaOptions
);

DivisionSchema.index({ name: 1 }, { unique: true });
DivisionSchema.index({ created_at: -1 });
DivisionSchema.index({ is_active: 1, created_at: -1 });

export const DivisionModel = mongoose.model('Division', DivisionSchema);

