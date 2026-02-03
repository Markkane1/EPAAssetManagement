import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const APPROVAL_STATUSES = ['Pending', 'Approved', 'Rejected', 'Cancelled'] as const;

const ApprovalRequestSchema = new Schema(
  {
    // Record requiring approval
    record_id: { type: Schema.Types.ObjectId, ref: 'Record', required: true },
    // User who requested approval
    requested_by_user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Optional explicit approver user
    approver_user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // Role-based approver requirement
    approver_role: { type: String, default: null },
    // Approval decision status
    status: { type: String, enum: APPROVAL_STATUSES, default: 'Pending', required: true },
    // When approval was requested
    requested_at: { type: Date, required: true },
    // When approval was decided
    decided_at: { type: Date, default: null },
    // Notes or rationale for decision
    decision_notes: { type: String, default: null },
  },
  baseSchemaOptions
);

ApprovalRequestSchema.index({ record_id: 1, status: 1 });

export const ApprovalRequestModel = mongoose.model('ApprovalRequest', ApprovalRequestSchema);
