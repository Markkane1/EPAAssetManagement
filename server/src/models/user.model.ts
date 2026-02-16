import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';
import { USER_ROLE_VALUES } from '../utils/roles';

const UserSchema = new Schema<any>(
  {
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password_hash: { type: String, required: true },
    first_name: { type: String, default: null },
    last_name: { type: String, default: null },
    role: { type: String, enum: USER_ROLE_VALUES, default: 'employee' },
    location_id: { type: Schema.Types.ObjectId, ref: 'Office', default: null },
    last_login_at: { type: String, default: null },
    last_password_change_at: { type: String, default: null },
    is_active: { type: Boolean, default: true },
    token_version: { type: Number, default: 0 },
    failed_login_attempts: { type: Number, default: 0 },
    lockout_until: { type: Date, default: null },
    password_reset_token_hash: { type: String, default: null },
    password_reset_expires_at: { type: Date, default: null },
    password_reset_requested_at: { type: Date, default: null },
  },
  baseSchemaOptions
);

export const UserModel = mongoose.model<any>('User', UserSchema);


