import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const PurchaseOrderSchema = new Schema(
  {
    order_number: { type: String, required: true, trim: true },
    order_date: { type: String, required: true },
    expected_delivery_date: { type: String, default: null },
    delivered_date: { type: String, default: null },
    total_amount: { type: Number, required: true },
    vendor_id: { type: Schema.Types.ObjectId, ref: 'Vendor', default: null },
    project_id: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    status: { type: String, default: 'Draft' },
    notes: { type: String, default: null },
  },
  baseSchemaOptions
);

export const PurchaseOrderModel = mongoose.model('PurchaseOrder', PurchaseOrderSchema);
