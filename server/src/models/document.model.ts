import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const DOCUMENT_TYPES = [
  'IssueSlip',
  'ReturnSlip',
  'TransferChallan',
  'MaintenanceJobCard',
  'Warranty',
  'Invoice',
  'DisposalApproval',
  'IncidentReport',
  'Other',
] as const;

const DOCUMENT_STATUSES = ['Draft', 'Final', 'Archived'] as const;

const DocumentSchema = new Schema(
  {
    // Title or short name for the document
    title: { type: String, required: true, trim: true },
    // Document classification
    doc_type: { type: String, enum: DOCUMENT_TYPES, required: true },
    // Document lifecycle status
    status: { type: String, enum: DOCUMENT_STATUSES, default: 'Draft', required: true },
    // Office that owns the document
    office_id: { type: Schema.Types.ObjectId, ref: 'Office', required: true },
    // User who created the document record
    created_by_user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  baseSchemaOptions
);

DocumentSchema.index({ office_id: 1, doc_type: 1 });

export const DocumentModel = mongoose.model('Document', DocumentSchema);
