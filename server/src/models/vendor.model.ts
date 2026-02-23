import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const VendorSchema = new Schema<any>(
  {
    name: { type: String, required: true, trim: true },
    contact_info: { type: String, default: null },
    email: { type: String, default: null },
    phone: { type: String, default: null },
    address: { type: String, default: null },
    office_id: { type: Schema.Types.ObjectId, ref: 'Office', default: null },
  },
  baseSchemaOptions
);

VendorSchema.index({ created_at: -1 });
VendorSchema.index({ name: 1 });
VendorSchema.index({ office_id: 1, created_at: -1 });
VendorSchema.index({ office_id: 1, name: 1 });

export const VendorModel = mongoose.model<any>('Vendor', VendorSchema);


