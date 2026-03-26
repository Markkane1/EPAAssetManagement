import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';
import { buildSearchTerms } from '../utils/searchTerms';

const VendorSchema = new Schema<any>(
  {
    name: { type: String, required: true, trim: true },
    contact_info: { type: String, default: null },
    email: { type: String, default: null },
    phone: { type: String, default: null },
    address: { type: String, default: null },
    office_id: { type: Schema.Types.ObjectId, ref: 'Office', default: null },
    search_terms: { type: [String], default: undefined, select: false },
  },
  baseSchemaOptions
);

VendorSchema.pre('validate', function (next) {
  this.search_terms = buildSearchTerms([this.name, this.email, this.phone]);
  next();
});

VendorSchema.index({ created_at: -1 });
VendorSchema.index({ name: 1 });
VendorSchema.index({ office_id: 1, created_at: -1 });
VendorSchema.index({ office_id: 1, name: 1 });
VendorSchema.index({ office_id: 1, search_terms: 1, created_at: -1 });

export const VendorModel = mongoose.model<any>('Vendor', VendorSchema);


