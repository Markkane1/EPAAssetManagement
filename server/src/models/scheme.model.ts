import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const SchemeSchema = new Schema(
  {
    project_id: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    is_active: { type: Boolean, default: true },
  },
  baseSchemaOptions
);

export const SchemeModel = mongoose.model('Scheme', SchemeSchema);
