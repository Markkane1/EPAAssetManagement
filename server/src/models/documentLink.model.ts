import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const ENTITY_TYPES = ['Record', 'AssetItem', 'Assignment', 'Transfer', 'MaintenanceRecord', 'Requisition'] as const;
const REQUIRED_STATUSES = ['PendingApproval', 'Approved', 'Completed'] as const;

const DocumentLinkSchema = new Schema(
  {
    // Document being linked
    document_id: { type: Schema.Types.ObjectId, ref: 'Document', required: true },
    // Linked entity type
    entity_type: { type: String, enum: ENTITY_TYPES, required: true },
    // Linked entity id
    entity_id: { type: Schema.Types.ObjectId, required: true },
    // Optional status gate for transitions
    required_for_status: { type: String, enum: REQUIRED_STATUSES, default: null },
  },
  baseSchemaOptions
);

DocumentLinkSchema.index({ entity_type: 1, entity_id: 1 });
DocumentLinkSchema.index({ document_id: 1, entity_type: 1, entity_id: 1 }, { unique: true });

export type DocumentLinkDoc = mongoose.InferSchemaType<typeof DocumentLinkSchema>;

export const DocumentLinkModel = mongoose.model<DocumentLinkDoc>('DocumentLink', DocumentLinkSchema);


