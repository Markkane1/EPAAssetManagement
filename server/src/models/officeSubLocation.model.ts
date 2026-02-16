import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const OfficeSubLocationSchema = new Schema<any>(
  {
    office_id: { type: Schema.Types.ObjectId, ref: 'Office', required: true },
    name: { type: String, required: true, trim: true },
    is_active: { type: Boolean, default: true },
  },
  baseSchemaOptions
);

OfficeSubLocationSchema.index(
  { office_id: 1, name: 1 },
  {
    unique: true,
    collation: { locale: 'en', strength: 2 },
  }
);
OfficeSubLocationSchema.index({ office_id: 1, is_active: 1 });

export const OfficeSubLocationModel = mongoose.model<any>('OfficeSubLocation', OfficeSubLocationSchema);


