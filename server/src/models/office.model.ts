import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const OfficeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    division: { type: String, default: null, trim: true },
    district: { type: String, default: null, trim: true },
    address: { type: String, default: null },
    contact_number: { type: String, default: null, trim: true },
    type: { type: String, enum: ['CENTRAL', 'LAB', 'SUBSTORE'], default: 'LAB' },
    parent_location_id: { type: Schema.Types.ObjectId, ref: 'Office', default: null },
    lab_code: { type: String, default: null, trim: true },
    is_active: { type: Boolean, default: true },
  },
  baseSchemaOptions
);

export const OfficeModel = mongoose.model('Office', OfficeSchema);
