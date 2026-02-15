import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from '../../../models/base';

const ConsumableUnitSchema = new Schema<any>(
  {
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    group: { type: String, enum: ['mass', 'volume', 'count'], required: true },
    to_base: { type: Number, required: true },
    aliases: { type: [String], default: [] },
    is_active: { type: Boolean, default: true },
  },
  baseSchemaOptions
);

ConsumableUnitSchema.index({ code: 1 }, { unique: true });
ConsumableUnitSchema.index({ is_active: 1, group: 1, to_base: 1, code: 1 });

export const ConsumableUnitModel = mongoose.model('ConsumableUnit', ConsumableUnitSchema);

