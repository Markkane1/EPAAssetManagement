import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const DistrictSchema = new Schema<any>(
  {
    name: { type: String, required: true, trim: true },
    division_id: { type: Schema.Types.ObjectId, ref: 'Division', default: null },
    is_active: { type: Boolean, default: true },
  },
  baseSchemaOptions
);

DistrictSchema.index({ name: 1, division_id: 1 }, { unique: true });
DistrictSchema.index({ division_id: 1, created_at: -1 });
DistrictSchema.index({ created_at: -1 });

export const DistrictModel = mongoose.model<any>('District', DistrictSchema);


