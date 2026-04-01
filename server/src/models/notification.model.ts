import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';
import {
  NOTIFICATION_TYPES_ARRAY,
  NOTIFICATION_ENTITY_TYPES_ARRAY,
} from '../constants/notificationTypes';

const NotificationSchema = new Schema<any>(
  {
    recipient_user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    office_id: { type: Schema.Types.ObjectId, ref: 'Office', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES_ARRAY, required: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    entity_type: { type: String, enum: NOTIFICATION_ENTITY_TYPES_ARRAY, required: true },
    entity_id: { type: Schema.Types.ObjectId, required: true },
    is_read: { type: Boolean, default: false },
    acknowledged_at: { type: Date, default: null },
    last_action: { type: String, default: null },
    last_action_at: { type: Date, default: null },
  },
  baseSchemaOptions
);

NotificationSchema.index({ recipient_user_id: 1, is_read: 1, created_at: -1 });
NotificationSchema.index({ recipient_user_id: 1, created_at: -1 });
NotificationSchema.index({ office_id: 1, created_at: -1 });
NotificationSchema.index({
  recipient_user_id: 1,
  office_id: 1,
  type: 1,
  entity_type: 1,
  entity_id: 1,
  created_at: -1,
});

export const NotificationModel = mongoose.model<any>('Notification', NotificationSchema);


