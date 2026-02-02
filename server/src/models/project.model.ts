import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const ProjectSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, default: null },
    description: { type: String, default: null },
    start_date: { type: String, default: null },
    end_date: { type: String, default: null },
    budget: { type: Number, default: null },
    is_active: { type: Boolean, default: true },
  },
  baseSchemaOptions
);

export const ProjectModel = mongoose.model('Project', ProjectSchema);
