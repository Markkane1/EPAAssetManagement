import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const REQUISITION_STATUSES = [
  'SUBMITTED',
  'APPROVED',
  'PARTIALLY_FULFILLED',
  'FULFILLED',
  'REJECTED_INVALID',
  'CANCELLED',
  // Legacy statuses kept for backward compatibility.
  'PENDING_VERIFICATION',
  'VERIFIED_APPROVED',
  'IN_FULFILLMENT',
  'FULFILLED_PENDING_SIGNATURE',
] as const;

const REQUISITION_TARGET_TYPES = ['EMPLOYEE', 'SUB_LOCATION'] as const;

const RequisitionSchema = new Schema(
  {
    // File number from official paperwork/workflow.
    file_number: { type: String, required: true, trim: true },
    // Administrative office scope of the requisition.
    office_id: { type: Schema.Types.ObjectId, ref: 'Office', required: true },
    // Operational issuing office/stock register; currently may match office_id.
    issuing_office_id: { type: Schema.Types.ObjectId, ref: 'Office', required: true },
    // Nullable when requisition is not tied to a specific employee.
    requested_by_employee_id: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
    target_type: { type: String, enum: REQUISITION_TARGET_TYPES, required: true },
    target_id: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: function (this: { target_type?: string }) {
        return this.target_type === 'SUB_LOCATION' ? 'OfficeSubLocation' : 'Employee';
      },
    },
    // Optional direct room/section linkage for operational context.
    linked_sub_location_id: { type: Schema.Types.ObjectId, ref: 'OfficeSubLocation', default: null },
    // User who submitted/created the requisition.
    submitted_by_user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // User who completed fulfillment.
    fulfilled_by_user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // ISSUE record generated during fulfillment workflow.
    record_id: { type: Schema.Types.ObjectId, ref: 'Record', default: null },
    // Final signed issuance slip linkage.
    signed_issuance_document_id: { type: Schema.Types.ObjectId, ref: 'Document', default: null },
    signed_issuance_uploaded_at: { type: Date, default: null },
    // Optional signed/supporting file metadata for verification.
    attachment_file_name: { type: String, default: null },
    attachment_mime_type: { type: String, default: null },
    attachment_size_bytes: { type: Number, default: null },
    attachment_path: { type: String, default: null },
    status: { type: String, enum: REQUISITION_STATUSES, default: 'SUBMITTED' },
    remarks: { type: String, default: null },
  },
  baseSchemaOptions
);

RequisitionSchema.pre('validate', function (next) {
  const targetType = this.target_type;
  const targetId = this.target_id;

  if (targetType === 'EMPLOYEE') {
    if (!mongoose.isValidObjectId(targetId)) {
      this.invalidate('target_id', 'target_id must be a valid ObjectId');
    }
  }
  if (targetType === 'SUB_LOCATION') {
    if (!mongoose.isValidObjectId(targetId)) {
      this.invalidate('target_id', 'target_id must be a valid ObjectId');
    }
  }
  next();
});

RequisitionSchema.index({ file_number: 1 }, { unique: true });
RequisitionSchema.index({ status: 1, created_at: -1 });
RequisitionSchema.index({ office_id: 1, status: 1, created_at: -1 });
RequisitionSchema.index({ issuing_office_id: 1, status: 1, created_at: -1 });
RequisitionSchema.index({ record_id: 1 });
RequisitionSchema.index({ signed_issuance_document_id: 1 });
RequisitionSchema.index({ created_at: -1 });

export type RequisitionDoc = mongoose.InferSchemaType<typeof RequisitionSchema>;

export const RequisitionModel = mongoose.model<RequisitionDoc>('Requisition', RequisitionSchema);


