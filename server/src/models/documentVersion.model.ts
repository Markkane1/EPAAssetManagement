import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const DocumentVersionSchema = new Schema(
  {
    // Parent document
    document_id: { type: Schema.Types.ObjectId, ref: 'Document', required: true },
    // Sequential version number
    version_no: { type: Number, required: true },
    // File metadata
    file_name: { type: String, required: true },
    mime_type: { type: String, required: true },
    size_bytes: { type: Number, required: true },
    // Storage location (local disk path by default)
    storage_key: { type: String, default: null },
    file_path: { type: String, required: true },
    file_url: { type: String, default: null },
    // Integrity hash of the file
    sha256: { type: String, required: true },
    // User who uploaded this version
    uploaded_by_user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Upload timestamp
    uploaded_at: { type: Date, required: true },
  },
  baseSchemaOptions
);

DocumentVersionSchema.index({ document_id: 1, version_no: 1 }, { unique: true });

export type DocumentVersionDoc = mongoose.InferSchemaType<typeof DocumentVersionSchema>;

export const DocumentVersionModel = mongoose.model<DocumentVersionDoc>('DocumentVersion', DocumentVersionSchema);


