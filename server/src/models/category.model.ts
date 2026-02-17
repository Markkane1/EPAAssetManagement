import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const CategorySchema = new Schema<any>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    scope: { type: String, enum: ['GENERAL', 'LAB_ONLY'], default: 'GENERAL', required: true },
    asset_type: { type: String, enum: ['ASSET', 'CONSUMABLE'], default: 'ASSET', required: true },
  },
  baseSchemaOptions
);

CategorySchema.index({ scope: 1 });
CategorySchema.index({ asset_type: 1 });
CategorySchema.index({ name: 1 });
CategorySchema.index({ scope: 1, name: 1 });
CategorySchema.index({ asset_type: 1, name: 1 });

export const CategoryModel = mongoose.model<any>('Category', CategorySchema);


