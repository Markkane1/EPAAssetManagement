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
    is_active: { type: Boolean, default: true },
  },
  baseSchemaOptions
);

export const UserModel = mongoose.model<any>('User', UserSchema);


