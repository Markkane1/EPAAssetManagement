import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const CategorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: null },
  },
  baseSchemaOptions
);

export const CategoryModel = mongoose.model('Category', CategorySchema);
