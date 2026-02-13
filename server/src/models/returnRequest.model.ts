import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const RETURN_REQUEST_STATUSES = [
  'SUBMITTED',
  'RECEIVED_CONFIRMED',
  'CLOSED_PENDING_SIGNATURE',
  'CLOSED',
  'REJECTED',
] as const;

const ReturnRequestLineSchema = new Schema(
  {
    asset_item_id: { type: Schema.Types.ObjectId, ref: 'AssetItem', required: true },
  },
  { _id: false }
);

const ReturnRequestSchema = new Schema(
  {
    employee_id: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    office_id: { type: Schema.Types.ObjectId, ref: 'Office', required: true },
    record_id: { type: Schema.Types.ObjectId, ref: 'Record', default: null },
    receipt_document_id: { type: Schema.Types.ObjectId, ref: 'Document', default: null },
    status: { type: String, enum: RETURN_REQUEST_STATUSES, default: 'SUBMITTED', required: true },
    lines: {
      type: [ReturnRequestLineSchema],
      required: true,
      validate: {
        validator(lines: Array<{ asset_item_id?: unknown }>) {
          return Array.isArray(lines) && lines.length > 0;
        },
        message: 'At least one return line is required',
      },
    },
  },
  baseSchemaOptions
);

ReturnRequestSchema.index({ office_id: 1, status: 1, created_at: -1 });
ReturnRequestSchema.index({ employee_id: 1, status: 1, created_at: -1 });
ReturnRequestSchema.index({ 'lines.asset_item_id': 1, created_at: -1 });
ReturnRequestSchema.index({ record_id: 1 });
ReturnRequestSchema.index({ receipt_document_id: 1 });
ReturnRequestSchema.index({ created_at: -1 });

export const ReturnRequestModel = mongoose.model('ReturnRequest', ReturnRequestSchema);
