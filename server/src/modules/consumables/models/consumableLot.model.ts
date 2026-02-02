import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from '../../../models/base';

const LotDocsSchema = new Schema(
  {
    sds_url: { type: String, default: null },
    coa_url: { type: String, default: null },
    invoice_url: { type: String, default: null },
  },
  { _id: false }
);

const ConsumableLotSchema = new Schema(
  {
    consumable_item_id: { type: Schema.Types.ObjectId, ref: 'ConsumableItem', required: true },
    supplier_id: { type: Schema.Types.ObjectId, ref: 'ConsumableSupplier', default: null },
    lot_number: { type: String, required: true, trim: true },
    received_date: { type: String, required: true },
    expiry_date: { type: String, default: null },
    docs: { type: LotDocsSchema, default: () => ({}) },
  },
  baseSchemaOptions
);

export const ConsumableLotModel = mongoose.model('ConsumableLot', ConsumableLotSchema);
