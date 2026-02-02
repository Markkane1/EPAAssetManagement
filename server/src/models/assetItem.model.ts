import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const AssetItemSchema = new Schema(
  {
    asset_id: { type: Schema.Types.ObjectId, ref: 'Asset', required: true },
    location_id: { type: Schema.Types.ObjectId, ref: 'Office', default: null },
    serial_number: { type: String, default: null },
    tag: { type: String, default: null },
    assignment_status: { type: String, default: 'Unassigned' },
    item_status: { type: String, default: 'Available' },
    item_condition: { type: String, default: 'Good' },
    functional_status: { type: String, default: 'Functional' },
    item_source: { type: String, default: 'Purchased' },
    purchase_date: { type: String, default: null },
    warranty_expiry: { type: String, default: null },
    notes: { type: String, default: null },
  },
  baseSchemaOptions
);

export const AssetItemModel = mongoose.model('AssetItem', AssetItemSchema);
