import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const AssetDimensionSchema = new Schema<any>(
  {
    length: { type: Number, default: null },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    unit: { type: String, enum: ['mm', 'cm', 'm', 'in', 'ft'], default: 'cm' },
  },
  { _id: false }
);

const AssetSchema = new Schema<any>(
  {
    // Human-readable asset name (master definition)
    name: { type: String, required: true, trim: true },
    // Optional description of the asset model
    description: { type: String, default: null },
    // Detailed free-text technical specification
    specification: { type: String, default: null },
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
    // Physical dimensions of the asset (optional)
    dimensions: {
      type: AssetDimensionSchema,
      default: () => ({ length: null, width: null, height: null, unit: 'cm' }),
    },
    // Source document attachment metadata (invoice or project handover PDF)
    attachment_file_name: { type: String, default: null },
    attachment_mime_type: { type: String, default: null },
    attachment_size_bytes: { type: Number, default: null },
    attachment_path: { type: String, default: null },
    // Soft-active flag to preserve history
    is_active: { type: Boolean, default: true },
  },
  baseSchemaOptions
);

AssetSchema.index({ category_id: 1, is_active: 1 });
AssetSchema.index({ vendor_id: 1, is_active: 1 });
AssetSchema.index({ created_at: -1 });
AssetSchema.index({ is_active: 1, name: 1 });

export const AssetModel = mongoose.model<any>('Asset', AssetSchema);


