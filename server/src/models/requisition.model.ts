import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const REQUISITION_STATUSES = [
  'PENDING_VERIFICATION',
  'VERIFIED_APPROVED',
  'IN_FULFILLMENT',
  'PARTIALLY_FULFILLED',
  'FULFILLED_PENDING_SIGNATURE',
  'FULFILLED',
  'REJECTED_INVALID',
  'CANCELLED',
] as const;

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
    status: { type: String, enum: REQUISITION_STATUSES, default: 'PENDING_VERIFICATION' },
    remarks: { type: String, default: null },
  },
  baseSchemaOptions
);

RequisitionSchema.index({ file_number: 1 }, { unique: true });
RequisitionSchema.index({ status: 1, created_at: -1 });
RequisitionSchema.index({ office_id: 1, status: 1, created_at: -1 });
RequisitionSchema.index({ issuing_office_id: 1, status: 1, created_at: -1 });
RequisitionSchema.index({ record_id: 1 });
RequisitionSchema.index({ signed_issuance_document_id: 1 });
RequisitionSchema.index({ created_at: -1 });

function ensureFulfilledRequiresSignedMetadata(target: {
  status?: unknown;
  signed_issuance_document_id?: unknown;
  signed_issuance_uploaded_at?: unknown;
}) {
  if (target.status !== 'FULFILLED') return;
  if (!target.signed_issuance_document_id || !target.signed_issuance_uploaded_at) {
    throw new Error('Cannot set requisition status to FULFILLED without signed issuance upload');
  }
}

RequisitionSchema.pre('save', function (next) {
  try {
    if (this.isModified('status') || this.status === 'FULFILLED') {
      ensureFulfilledRequiresSignedMetadata({
        status: this.status,
        signed_issuance_document_id: this.signed_issuance_document_id,
        signed_issuance_uploaded_at: this.signed_issuance_uploaded_at,
      });
    }
    next();
  } catch (error) {
    next(error as Error);
  }
});

RequisitionSchema.pre('findOneAndUpdate', function (next) {
  try {
    const update = (this.getUpdate() || {}) as Record<string, any>;
    const set = (update.$set || {}) as Record<string, any>;
    const status = set.status ?? update.status;
    if (status === 'FULFILLED') {
      const signedDocId = set.signed_issuance_document_id ?? update.signed_issuance_document_id;
      const signedAt = set.signed_issuance_uploaded_at ?? update.signed_issuance_uploaded_at;
      ensureFulfilledRequiresSignedMetadata({
        status,
        signed_issuance_document_id: signedDocId,
        signed_issuance_uploaded_at: signedAt,
      });
    }
    next();
  } catch (error) {
    next(error as Error);
  }
});

function guardStatusUpdate(this: any, next: (error?: Error) => void) {
  try {
    const update = (this.getUpdate() || {}) as Record<string, any>;
    const set = (update.$set || {}) as Record<string, any>;
    const status = set.status ?? update.status;
    if (status === 'FULFILLED') {
      const signedDocId = set.signed_issuance_document_id ?? update.signed_issuance_document_id;
      const signedAt = set.signed_issuance_uploaded_at ?? update.signed_issuance_uploaded_at;
      ensureFulfilledRequiresSignedMetadata({
        status,
        signed_issuance_document_id: signedDocId,
        signed_issuance_uploaded_at: signedAt,
      });
    }
    next();
  } catch (error) {
    next(error as Error);
  }
}

RequisitionSchema.pre('updateOne', guardStatusUpdate);
RequisitionSchema.pre('updateMany', guardStatusUpdate);

export const RequisitionModel = mongoose.model('Requisition', RequisitionSchema);
