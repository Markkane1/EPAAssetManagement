import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const AssetSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    category_id: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    vendor_id: { type: Schema.Types.ObjectId, ref: 'Vendor', default: null },
    purchase_order_id: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder', default: null },
    project_id: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    asset_source: { type: String, default: null },
    scheme_id: { type: Schema.Types.ObjectId, ref: 'Scheme', default: null },
    acquisition_date: { type: String, default: null },
    unit_price: { type: Number, default: null },
    currency: { type: String, default: 'PKR' },
    quantity: { type: Number, default: 1 },
    is_active: { type: Boolean, default: true },
  },
  baseSchemaOptions
);

export const AssetModel = mongoose.model('Asset', AssetSchema);
