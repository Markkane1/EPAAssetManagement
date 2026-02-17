import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const PurchaseOrderSchema = new Schema<any>(
  {
    order_number: { type: String, required: true, trim: true },
    order_date: { type: String, required: true },
    expected_delivery_date: { type: String, default: null },
    delivered_date: { type: String, default: null },
    source_type: { type: String, enum: ['procurement', 'project'], default: 'procurement' },
    source_name: { type: String, trim: true, default: null },
    total_amount: { type: Number, required: true },
    unit_price: { type: Number, default: null },
    tax_percentage: { type: Number, default: 0 },
    tax_amount: { type: Number, default: 0 },
    vendor_id: { type: Schema.Types.ObjectId, ref: 'Vendor', default: null },
    project_id: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    scheme_id: { type: Schema.Types.ObjectId, ref: 'Scheme', default: null },
    attachment_file_name: { type: String, default: null },
    attachment_mime_type: { type: String, default: null },
    attachment_size_bytes: { type: Number, default: null },
    attachment_path: { type: String, default: null },
    status: { type: String, default: 'Draft' },
    notes: { type: String, default: null },
  },
  baseSchemaOptions
);

PurchaseOrderSchema.index({ status: 1, order_date: -1 });
PurchaseOrderSchema.index({ vendor_id: 1, order_date: -1 });
PurchaseOrderSchema.index({ project_id: 1, order_date: -1 });
PurchaseOrderSchema.index({ scheme_id: 1, order_date: -1 });
PurchaseOrderSchema.index({ source_type: 1, order_date: -1 });
PurchaseOrderSchema.index({ order_date: -1 });

export const PurchaseOrderModel = mongoose.model<any>('PurchaseOrder', PurchaseOrderSchema);


