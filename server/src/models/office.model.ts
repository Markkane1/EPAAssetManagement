import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const CapabilitySchema = new Schema<any>(
  {
    moveables: { type: Boolean, default: true },
    consumables: { type: Boolean, default: true },
    chemicals: { type: Boolean, default: false },
  },
  { _id: false }
);

const OfficeSchema = new Schema<any>(
  {
    // Office name for display and lookups
    name: { type: String, required: true, trim: true },
    // Optional short office code used for reference numbers
    code: { type: String, default: null, trim: true },
    // Temporary free-text grouping fields (may be normalized later)
    division: { type: String, default: null, trim: true },
    district: { type: String, default: null, trim: true },
    // Physical address for the office
    address: { type: String, default: null },
    // Primary contact number for the office
    contact_number: { type: String, default: null, trim: true },
    // Office classification (new canonical set)
    type: {
      type: String,
      enum: ['HEAD_OFFICE', 'DIRECTORATE', 'DISTRICT_OFFICE', 'DISTRICT_LAB'],
      default: 'DISTRICT_OFFICE',
    },
    // Capability flags used for module filtering and enforcement
    capabilities: { type: CapabilitySchema, default: undefined },
    // Parent office reference for hierarchy (canonical field)
    parent_office_id: { type: Schema.Types.ObjectId, ref: 'Office', default: null },
    // Soft-active flag for office availability
    is_active: { type: Boolean, default: true },
  },
  baseSchemaOptions
);

OfficeSchema.index({ is_active: 1, created_at: -1 });
OfficeSchema.index({ type: 1, is_active: 1 });
OfficeSchema.index({ 'capabilities.chemicals': 1, type: 1, name: 1 });
OfficeSchema.index({ 'capabilities.consumables': 1, name: 1 });

export const OfficeModel = mongoose.model<any>('Office', OfficeSchema);


