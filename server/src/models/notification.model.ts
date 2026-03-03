import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const NOTIFICATION_TYPES = [
  'ASSIGNMENT_DRAFT_CREATED',
  'HANDOVER_SLIP_READY',
  'ASSIGNMENT_ISSUED',
  'RETURN_REQUESTED',
  'RETURN_SLIP_READY',
  'ASSIGNMENT_RETURNED',
  'TRANSFER_REQUESTED',
  'TRANSFER_APPROVED',
  'TRANSFER_REJECTED',
  'TRANSFER_DISPATCHED',
  'TRANSFER_RECEIVED',
  'MAINTENANCE_SCHEDULED',
  'MAINTENANCE_DUE',
  'MAINTENANCE_OVERDUE',
  'MAINTENANCE_COMPLETED',
  'LOW_STOCK_ALERT',
  'WARRANTY_EXPIRY_ALERT',
  'REQUISITION_SUBMITTED',
  'REQUISITION_APPROVED',
  'REQUISITION_FULFILLED',
  'REQUISITION_STATUS_CHANGED',
  'REQUISITION_VERIFIED',
  'REQUISITION_REJECTED',
] as const;

const NOTIFICATION_ENTITY_TYPES = [
  'Assignment',
  'Requisition',
  'Transfer',
  'MaintenanceRecord',
  'AssetItem',
  'ConsumableItem',
] as const;

const NotificationSchema = new Schema<any>(
  {
    recipient_user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    office_id: { type: Schema.Types.ObjectId, ref: 'Office', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    entity_type: { type: String, enum: NOTIFICATION_ENTITY_TYPES, required: true },
    entity_id: { type: Schema.Types.ObjectId, required: true },
    is_read: { type: Boolean, default: false },
  },
  baseSchemaOptions
);

NotificationSchema.index({ recipient_user_id: 1, is_read: 1, created_at: -1 });
NotificationSchema.index({ recipient_user_id: 1, created_at: -1 });
NotificationSchema.index({ office_id: 1, created_at: -1 });

export const NotificationModel = mongoose.model<any>('Notification', NotificationSchema);


