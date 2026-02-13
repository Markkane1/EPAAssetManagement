import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const CapabilitySchema = new Schema(
  {
    moveables: { type: Boolean, default: true },
    consumables: { type: Boolean, default: true },
    chemicals: { type: Boolean, default: false },
  },
  { _id: false }
);

const OfficeSchema = new Schema(
  {
    // Office name for display and lookups
    name: { type: String, required: true, trim: true },
    // Optional short office code used for reference numbers
    code: { type: String, default: null, trim: true },
    // Organizational grouping fields
    division: { type: String, default: null, trim: true },
    district: { type: String, default: null, trim: true },
    // Physical address for the office
    address: { type: String, default: null },
    // Primary contact number for the office
    contact_number: { type: String, default: null, trim: true },
    // Office classification used by consumables and reporting
    type: { type: String, enum: ['CENTRAL', 'LAB', 'SUBSTORE'], default: 'LAB' },
    // Capability flags used for module filtering and enforcement
    capabilities: { type: CapabilitySchema, default: undefined },
    // Parent office reference for hierarchy (e.g., lab within district)
    parent_location_id: { type: Schema.Types.ObjectId, ref: 'Office', default: null },
    // Optional lab code for lab offices
    lab_code: { type: String, default: null, trim: true },
    // Marks the single Head Office record for global access
    is_headoffice: { type: Boolean, default: false },
    // Soft-active flag for office availability
    is_active: { type: Boolean, default: true },
  },
  baseSchemaOptions
);

OfficeSchema.index(
  { is_headoffice: 1 },
  { unique: true, partialFilterExpression: { is_headoffice: true } }
);
OfficeSchema.index({ is_active: 1, created_at: -1 });
OfficeSchema.index({ type: 1, is_active: 1 });
OfficeSchema.index({ 'capabilities.chemicals': 1, type: 1, is_headoffice: 1, name: 1 });
OfficeSchema.index({ 'capabilities.consumables': 1, name: 1 });

export const OfficeModel = mongoose.model('Office', OfficeSchema);
