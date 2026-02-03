import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const RECORD_TYPES = ['ISSUE', 'RETURN', 'TRANSFER', 'MAINTENANCE', 'DISPOSAL', 'INCIDENT'] as const;
const RECORD_STATUSES = [
  'Draft',
  'PendingApproval',
  'Approved',
  'Completed',
  'Rejected',
  'Cancelled',
  'Archived',
] as const;

const RecordSchema = new Schema(
  {
    // Record classification for register and workflow logic
    record_type: { type: String, enum: RECORD_TYPES, required: true },
    // Human-readable reference number (unique)
    reference_no: { type: String, required: true, unique: true },
    // Register owner office
    office_id: { type: Schema.Types.ObjectId, ref: 'Office', required: true },
    // Lifecycle status
    status: { type: String, enum: RECORD_STATUSES, default: 'Draft', required: true },
    // User who created the record
    created_by_user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Links to other domain entities
    asset_item_id: { type: Schema.Types.ObjectId, ref: 'AssetItem', default: null },
    employee_id: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
    assignment_id: { type: Schema.Types.ObjectId, ref: 'Assignment', default: null },
    transfer_id: { type: Schema.Types.ObjectId, ref: 'Transfer', default: null },
    maintenance_record_id: { type: Schema.Types.ObjectId, ref: 'MaintenanceRecord', default: null },
    // Free-form notes or summary
    notes: { type: String, default: null },
  },
  baseSchemaOptions
);

RecordSchema.index({ office_id: 1, record_type: 1, status: 1 });
RecordSchema.index({ record_type: 1, created_at: -1 });

export const RecordModel = mongoose.model('Record', RecordSchema);
