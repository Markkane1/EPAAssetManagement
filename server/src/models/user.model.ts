import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password_hash: { type: String, required: true },
    first_name: { type: String, default: null },
    last_name: { type: String, default: null },
    role: { type: String, default: 'user' },
    location_id: { type: Schema.Types.ObjectId, ref: 'Office', default: null },
    last_login_at: { type: String, default: null },
    is_active: { type: Boolean, default: true },
  },
  baseSchemaOptions
);

export const UserModel = mongoose.model('User', UserSchema);
