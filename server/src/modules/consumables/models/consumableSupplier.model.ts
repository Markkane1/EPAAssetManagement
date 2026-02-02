import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from '../../../models/base';

const ConsumableSupplierSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    contact_name: { type: String, default: null },
    email: { type: String, default: null },
    phone: { type: String, default: null },
    address: { type: String, default: null },
    notes: { type: String, default: null },
  },
  baseSchemaOptions
);

export const ConsumableSupplierModel = mongoose.model('ConsumableSupplier', ConsumableSupplierSchema);
