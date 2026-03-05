import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const MATRIX_REQUEST_STATUSES = ['Pending', 'Approved', 'Rejected', 'Executed', 'Cancelled'] as const;
const MATRIX_DECISIONS = ['Approved', 'Rejected'] as const;
const MATRIX_SCOPES = ['same_office', 'org_wide'] as const;

const ApprovalDecisionSchema = new Schema<any>(
  {
    approver_user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    decision: { type: String, enum: MATRIX_DECISIONS, required: true },
    decided_at: { type: Date, required: true },
    notes: { type: String, default: null },
  },
  { _id: false }
);

const RuleSnapshotSchema = new Schema<any>(
  {
    id: { type: String, required: true },
    transaction_type: { type: String, required: true },
    min_amount: { type: Number, default: 0 },
    risk_tags: { type: [String], default: [] },
    required_approvals: { type: Number, required: true },
    approver_roles: { type: [String], default: [] },
    scope: { type: String, enum: MATRIX_SCOPES, default: 'same_office' },
    disallow_maker: { type: Boolean, default: true },
  },
  { _id: false }
);

const ApprovalMatrixRequestSchema = new Schema<any>(
  {
    transaction_type: { type: String, required: true },
    entity_type: { type: String, default: null },
    entity_id: { type: Schema.Types.ObjectId, default: null },
    office_id: { type: Schema.Types.ObjectId, ref: 'Office', default: null },
    maker_user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, default: 0 },
    risk_tags: { type: [String], default: [] },
    payload_digest: { type: String, required: true },
    status: { type: String, enum: MATRIX_REQUEST_STATUSES, default: 'Pending', required: true },
    requested_at: { type: Date, required: true },
    approved_at: { type: Date, default: null },
    rejected_at: { type: Date, default: null },
    executed_at: { type: Date, default: null },
    required_approvals: { type: Number, required: true },
    approvals: { type: [ApprovalDecisionSchema], default: [] },
    rule_snapshot: { type: RuleSnapshotSchema, required: true },
  },
  baseSchemaOptions
);

ApprovalMatrixRequestSchema.index({ transaction_type: 1, status: 1, requested_at: -1 });
ApprovalMatrixRequestSchema.index({ maker_user_id: 1, status: 1, requested_at: -1 });
ApprovalMatrixRequestSchema.index({ office_id: 1, status: 1, requested_at: -1 });
ApprovalMatrixRequestSchema.index({ entity_type: 1, entity_id: 1, status: 1 });
ApprovalMatrixRequestSchema.index({ payload_digest: 1, maker_user_id: 1, status: 1 });

export const ApprovalMatrixRequestModel = mongoose.model<any>(
  'ApprovalMatrixRequest',
  ApprovalMatrixRequestSchema
);
