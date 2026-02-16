import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const AuditLogSchema = new Schema<any>(
  {
    // Actor who performed the action
    actor_user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Office scope for the action
    office_id: { type: Schema.Types.ObjectId, ref: 'Office', required: true },
    // Action identifier
    action: { type: String, required: true },
    // Entity affected
    entity_type: { type: String, required: true },
    entity_id: { type: Schema.Types.ObjectId, required: true },
    // Timestamp of the action
    timestamp: { type: Date, required: true },
    // Small before/after summary
    diff: { type: Schema.Types.Mixed, default: null },
  },
  baseSchemaOptions
);

AuditLogSchema.index({ entity_type: 1, entity_id: 1, timestamp: -1 });
AuditLogSchema.index({ office_id: 1, timestamp: -1 });

export const AuditLogModel = mongoose.model<any>('AuditLog', AuditLogSchema);


