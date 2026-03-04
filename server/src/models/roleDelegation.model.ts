import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const ROLE_DELEGATION_STATUSES = ['ACTIVE', 'REVOKED', 'EXPIRED'] as const;

const RoleDelegationSchema = new Schema<any>(
  {
    delegator_user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    delegate_user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    office_id: { type: Schema.Types.ObjectId, ref: 'Office', required: true },
    delegated_roles: { type: [String], required: true, default: [] },
    starts_at: { type: Date, required: true },
    ends_at: { type: Date, required: true },
    reason: { type: String, default: null },
    status: { type: String, enum: ROLE_DELEGATION_STATUSES, default: 'ACTIVE', required: true },
    revoked_at: { type: Date, default: null },
    revoked_by_user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  baseSchemaOptions
);

RoleDelegationSchema.index({ delegate_user_id: 1, status: 1, starts_at: 1, ends_at: 1 });
RoleDelegationSchema.index({ delegator_user_id: 1, status: 1, starts_at: 1, ends_at: 1 });
RoleDelegationSchema.index({ office_id: 1, status: 1, starts_at: 1, ends_at: 1 });

export const RoleDelegationModel = mongoose.model<any>('RoleDelegation', RoleDelegationSchema);
