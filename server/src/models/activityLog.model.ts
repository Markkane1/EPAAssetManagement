import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const ActivityLogSchema = new Schema(
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

export const ActivityLogModel = mongoose.model('ActivityLog', ActivityLogSchema);
