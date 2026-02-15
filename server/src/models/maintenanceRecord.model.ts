import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const MAINTENANCE_TYPES = ['Preventive', 'Corrective', 'Emergency', 'Inspection'] as const;
const MAINTENANCE_STATUSES = ['Scheduled', 'InProgress', 'Completed', 'Cancelled'] as const;

const MaintenanceRecordSchema = new Schema<any>(
  {
    // Asset item under maintenance
    asset_item_id: { type: Schema.Types.ObjectId, ref: 'AssetItem', required: true },
    // Type of maintenance activity
    maintenance_type: { type: String, enum: MAINTENANCE_TYPES, default: 'Preventive' },
    // Maintenance workflow status
    maintenance_status: { type: String, enum: MAINTENANCE_STATUSES, default: 'Scheduled' },
    // Description of maintenance work
    description: { type: String, default: null },
    // Cost of maintenance (if applicable)
    cost: { type: Number, default: null },
    // Person/vendor who performed the work
    performed_by: { type: String, default: null },
    // Scheduled date for maintenance
    scheduled_date: { type: Date, default: null },
    // Completion date for maintenance
    completed_date: { type: Date, default: null },
    // Additional notes
    notes: { type: String, default: null },
    // Soft-active flag to preserve history
    is_active: { type: Boolean, default: true },
  },
  baseSchemaOptions
);

MaintenanceRecordSchema.index({ asset_item_id: 1, created_at: -1 });
MaintenanceRecordSchema.index({ maintenance_status: 1, created_at: -1 });
MaintenanceRecordSchema.index({ is_active: 1, created_at: -1 });

export const MaintenanceRecordModel = mongoose.model('MaintenanceRecord', MaintenanceRecordSchema);

