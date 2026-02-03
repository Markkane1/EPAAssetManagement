import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const ASSIGNMENT_STATUSES = ['Assigned', 'Unassigned'] as const;
const ITEM_STATUSES = ['Available', 'Assigned', 'Maintenance', 'Damaged', 'Retired', 'InTransit'] as const;
const ITEM_CONDITIONS = ['New', 'Good', 'Fair', 'Poor', 'Damaged'] as const;
const FUNCTIONAL_STATUSES = ['Functional', 'Need Repairs', 'Dead'] as const;
const ITEM_SOURCES = ['Purchased', 'Donated', 'Leased', 'Transferred'] as const;

const AssetItemSchema = new Schema(
  {
    // Reference to the master asset definition
    asset_id: { type: Schema.Types.ObjectId, ref: 'Asset', required: true },
    // Current physical office location for this asset item
    location_id: { type: Schema.Types.ObjectId, ref: 'Office', required: true },
    // Manufacturer serial number (if available)
    serial_number: { type: String, default: null },
    // Internal tag/label for physical tracking
    tag: { type: String, default: null },
    // Assignment state (assigned or unassigned)
    assignment_status: { type: String, enum: ASSIGNMENT_STATUSES, default: 'Unassigned' },
    // Operational status of the physical item
    item_status: { type: String, enum: ITEM_STATUSES, default: 'Available' },
    // Condition assessment for the physical item
    item_condition: { type: String, enum: ITEM_CONDITIONS, default: 'Good' },
    // Functional status for maintenance planning
    functional_status: { type: String, enum: FUNCTIONAL_STATUSES, default: 'Functional' },
    // Source of the physical item
    item_source: { type: String, enum: ITEM_SOURCES, default: 'Purchased' },
    // Purchase date of this specific item
    purchase_date: { type: Date, default: null },
    // Warranty expiry date for this specific item
    warranty_expiry: { type: Date, default: null },
    // Notes for this physical item
    notes: { type: String, default: null },
    // Soft-active flag to preserve history
    is_active: { type: Boolean, default: true },
  },
  baseSchemaOptions
);

export const AssetItemModel = mongoose.model('AssetItem', AssetItemSchema);
