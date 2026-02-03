import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const AssetSchema = new Schema(
  {
    // Human-readable asset name (master definition)
    name: { type: String, required: true, trim: true },
    // Optional description of the asset model
    description: { type: String, default: null },
    // Category reference for reporting and grouping
    category_id: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    // Vendor reference for procurement traceability
    vendor_id: { type: Schema.Types.ObjectId, ref: 'Vendor', default: null },
    // Purchase order reference for procurement traceability
    purchase_order_id: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder', default: null },
    // Project reference for project-funded assets
    project_id: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    // Source of the asset (procurement/project/etc)
    asset_source: { type: String, default: null },
    // Scheme reference when assets are tied to a scheme
    scheme_id: { type: Schema.Types.ObjectId, ref: 'Scheme', default: null },
    // Acquisition date (Date type for analytics)
    acquisition_date: { type: Date, default: null },
    // Unit price for valuation
    unit_price: { type: Number, default: null },
    // Currency code for valuation
    currency: { type: String, default: 'PKR' },
    // Logical quantity for the master definition
    quantity: { type: Number, default: 1 },
    // Soft-active flag to preserve history
    is_active: { type: Boolean, default: true },
  },
  baseSchemaOptions
);

export const AssetModel = mongoose.model('Asset', AssetSchema);
