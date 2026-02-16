import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const ASSIGNMENT_STATUSES = ['DRAFT', 'ISSUED', 'RETURN_REQUESTED', 'RETURNED', 'CANCELLED'] as const;
const ASSIGNED_TO_TYPES = ['EMPLOYEE', 'SUB_LOCATION'] as const;
const ACTIVE_ASSIGNMENT_STATUSES = new Set(['DRAFT', 'ISSUED', 'RETURN_REQUESTED']);

const AssignmentSchema = new Schema<any>(
  {
    // Asset item being assigned
    asset_item_id: { type: Schema.Types.ObjectId, ref: 'AssetItem', required: true },
    status: { type: String, enum: ASSIGNMENT_STATUSES, default: 'DRAFT', required: true },
    assigned_to_type: { type: String, enum: ASSIGNED_TO_TYPES, required: true },
    assigned_to_id: { type: Schema.Types.ObjectId, required: true },
    // Keep employee_id for compatibility; required only when assigned_to_type is EMPLOYEE.
    employee_id: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
    requisition_id: { type: Schema.Types.ObjectId, ref: 'Requisition', required: true },
    requisition_line_id: { type: Schema.Types.ObjectId, ref: 'RequisitionLine', required: true },
    handover_slip_document_id: { type: Schema.Types.ObjectId, ref: 'Document', default: null },
    handover_slip_generated_version_id: { type: Schema.Types.ObjectId, ref: 'DocumentVersion', default: null },
    handover_slip_signed_version_id: { type: Schema.Types.ObjectId, ref: 'DocumentVersion', default: null },
    return_slip_document_id: { type: Schema.Types.ObjectId, ref: 'Document', default: null },
    return_slip_generated_version_id: { type: Schema.Types.ObjectId, ref: 'DocumentVersion', default: null },
    return_slip_signed_version_id: { type: Schema.Types.ObjectId, ref: 'DocumentVersion', default: null },
    issued_by_user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    issued_at: { type: Date, default: null },
    return_requested_by_user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    return_requested_at: { type: Date, default: null },
    returned_by_user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    returned_at: { type: Date, default: null },
    // Assignment start date
    assigned_date: { type: Date, required: true },
    // Expected return date for planning
    expected_return_date: { type: Date, default: null },
    // Actual return date when closed
    returned_date: { type: Date, default: null },
    // Notes related to this assignment
    notes: { type: String, default: null },
    // Only one active assignment per asset item
    is_active: { type: Boolean, default: true },
  },
  baseSchemaOptions
);

AssignmentSchema.pre('validate', function (next) {
  if (this.assigned_to_type === 'EMPLOYEE') {
    if (!this.employee_id) {
      this.invalidate('employee_id', 'employee_id is required when assigned_to_type is EMPLOYEE');
    } else if (String(this.employee_id) !== String(this.assigned_to_id)) {
      this.invalidate('employee_id', 'employee_id must equal assigned_to_id when assigned_to_type is EMPLOYEE');
    }
  }

  if (this.assigned_to_type === 'SUB_LOCATION') {
    if (this.employee_id !== null && this.employee_id !== undefined) {
      this.invalidate('employee_id', 'employee_id must be null when assigned_to_type is SUB_LOCATION');
    }
  }
  next();
});

AssignmentSchema.pre('save', function (next) {
  this.is_active = ACTIVE_ASSIGNMENT_STATUSES.has(String(this.status));
  next();
});

AssignmentSchema.index(
  { asset_item_id: 1, is_active: 1 },
  { name: 'uniq_assignment_asset_item_active', unique: true, partialFilterExpression: { is_active: true } }
);
AssignmentSchema.index(
  { asset_item_id: 1 },
  {
    name: 'uniq_assignment_asset_item_open_status',
    unique: true,
    partialFilterExpression: { status: { $in: ['DRAFT', 'ISSUED', 'RETURN_REQUESTED'] } },
  }
);
AssignmentSchema.index({ is_active: 1, assigned_date: -1 });
AssignmentSchema.index({ employee_id: 1, assigned_date: -1 });
AssignmentSchema.index({ asset_item_id: 1, assigned_date: -1 });
AssignmentSchema.index({ created_at: -1 });

export const AssignmentModel = mongoose.model<any>('Assignment', AssignmentSchema);


