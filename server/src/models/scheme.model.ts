import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const SchemeSchema = new Schema<any>(
  {
    project_id: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    is_active: { type: Boolean, default: true },
  },
  baseSchemaOptions
);

SchemeSchema.index({ project_id: 1, is_active: 1, created_at: -1 });
SchemeSchema.index({ created_at: -1 });
SchemeSchema.index({ name: 1, project_id: 1 });

export const SchemeModel = mongoose.model<any>('Scheme', SchemeSchema);


