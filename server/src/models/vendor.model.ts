import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const VendorSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    contact_info: { type: String, default: null },
    email: { type: String, default: null },
    phone: { type: String, default: null },
    address: { type: String, default: null },
  },
  baseSchemaOptions
);

export const VendorModel = mongoose.model('Vendor', VendorSchema);
