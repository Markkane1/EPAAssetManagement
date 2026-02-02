import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const TransferHistorySchema = new Schema(
  {
    asset_item_id: { type: Schema.Types.ObjectId, ref: 'AssetItem', required: true },
    from_location_id: { type: Schema.Types.ObjectId, ref: 'Office', default: null },
    to_location_id: { type: Schema.Types.ObjectId, ref: 'Office', required: true },
    transfer_date: { type: String, required: true },
    reason: { type: String, default: null },
    performed_by: { type: String, default: null },
  },
  baseSchemaOptions
);

export const TransferHistoryModel = mongoose.model('TransferHistory', TransferHistorySchema);
