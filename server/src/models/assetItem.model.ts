import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const ASSIGNMENT_STATUSES = ['Assigned', 'Unassigned', 'InTransit'] as const;
const ITEM_STATUSES = ['Available', 'Assigned', 'Maintenance', 'Damaged', 'Retired', 'InTransit'] as const;
const ITEM_CONDITIONS = ['New', 'Good', 'Fair', 'Poor', 'Damaged'] as const;
const FUNCTIONAL_STATUSES = ['Functional', 'Need Repairs', 'Dead'] as const;
const ITEM_SOURCES = ['Purchased', 'Transferred'] as const;
const HOLDER_TYPES = ['OFFICE', 'STORE'] as const;

const baseTransform = (baseSchemaOptions.toJSON as any)?.transform;

const AssetItemSchema = new Schema<any>(
  {
    // Reference to the master asset definition
    asset_id: { type: Schema.Types.ObjectId, ref: 'Asset', required: true },
    // Current holder type. Deprecated documents may still rely on location_id only.
    holder_type: { type: String, enum: HOLDER_TYPES, default: null },
    // Current holder id (Office or Store based on holder_type)
    holder_id: { type: Schema.Types.ObjectId, default: null },
    // Deprecated compatibility field. New writes should use holder_type/holder_id.
    location_id: { type: Schema.Types.ObjectId, ref: 'Office', default: null },
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
  {
    ...baseSchemaOptions,
    toJSON: {
      ...(baseSchemaOptions.toJSON || {}),
      transform: (doc: unknown, ret: Record<string, unknown>) => {
        if (typeof baseTransform === 'function') {
          baseTransform(doc, ret);
        }
        if ((!ret.location_id || ret.location_id === null) && ret.holder_type === 'OFFICE' && ret.holder_id) {
          ret.location_id = ret.holder_id;
        }
      },
    },
  }
);

AssetItemSchema.index({ location_id: 1, is_active: 1 });
AssetItemSchema.index({ holder_type: 1, holder_id: 1, is_active: 1 });
AssetItemSchema.index({ asset_id: 1, is_active: 1 });
AssetItemSchema.index({ item_status: 1, is_active: 1 });
AssetItemSchema.index({ assignment_status: 1, is_active: 1 });
AssetItemSchema.index({ location_id: 1, is_active: 1, created_at: -1 });
AssetItemSchema.index({ asset_id: 1, is_active: 1, created_at: -1 });
AssetItemSchema.index({ is_active: 1, created_at: -1 });
AssetItemSchema.index({ created_at: -1 });

export const AssetItemModel = mongoose.model<any>('AssetItem', AssetItemSchema);


