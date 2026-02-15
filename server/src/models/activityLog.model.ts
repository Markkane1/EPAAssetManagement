import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const ActivityLogSchema = new Schema<any>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    activity_type: { type: String, required: true },
    description: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
    ip_address: { type: String, default: null },
    user_agent: { type: String, default: null },
  },
  baseSchemaOptions
);

ActivityLogSchema.index({ created_at: -1 });
ActivityLogSchema.index({ user_id: 1, created_at: -1 });
ActivityLogSchema.index({ activity_type: 1, created_at: -1 });

export const ActivityLogModel = mongoose.model('ActivityLog', ActivityLogSchema);

