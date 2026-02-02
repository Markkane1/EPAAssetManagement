import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const OrganizationSchema = new Schema(
  {
    name: { type: String, default: '' },
    code: { type: String, default: '' },
    address: { type: String, default: '' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
  },
  { _id: false }
);

const NotificationSchema = new Schema(
  {
    low_stock_alerts: { type: Boolean, default: true },
    maintenance_reminders: { type: Boolean, default: true },
    assignment_notifications: { type: Boolean, default: true },
    warranty_expiry_alerts: { type: Boolean, default: false },
  },
  { _id: false }
);

const SecuritySchema = new Schema(
  {
    two_factor_required: { type: Boolean, default: false },
    session_timeout_minutes: { type: Number, default: 30 },
    audit_logging: { type: Boolean, default: true },
  },
  { _id: false }
);

const SystemSettingsSchema = new Schema(
  {
    organization: { type: OrganizationSchema, default: () => ({}) },
    notifications: { type: NotificationSchema, default: () => ({}) },
    security: { type: SecuritySchema, default: () => ({}) },
    last_backup_at: { type: String, default: null },
  },
  baseSchemaOptions
);

export const SystemSettingsModel = mongoose.model('SystemSettings', SystemSettingsSchema);
