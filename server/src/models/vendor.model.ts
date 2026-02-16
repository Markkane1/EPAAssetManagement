import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const VendorSchema = new Schema<any>(
  {
    name: { type: String, required: true, trim: true },
    contact_info: { type: String, default: null },
    email: { type: String, default: null },
    phone: { type: String, default: null },
    address: { type: String, default: null },
  },
  baseSchemaOptions
);

export const VendorModel = mongoose.model<any>('Vendor', VendorSchema);


