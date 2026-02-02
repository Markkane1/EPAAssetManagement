import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const MaintenanceRecordSchema = new Schema(
  {
    asset_item_id: { type: Schema.Types.ObjectId, ref: 'AssetItem', required: true },
    maintenance_type: { type: String, default: 'Preventive' },
    maintenance_status: { type: String, default: 'Scheduled' },
    description: { type: String, default: null },
    cost: { type: Number, default: null },
    performed_by: { type: String, default: null },
    scheduled_date: { type: String, default: null },
    completed_date: { type: String, default: null },
    notes: { type: String, default: null },
  },
  baseSchemaOptions
);

export const MaintenanceRecordModel = mongoose.model('MaintenanceRecord', MaintenanceRecordSchema);
