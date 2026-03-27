import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';
import { buildSearchTerms } from '../utils/searchTerms';

const CategorySchema = new Schema<any>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    scope: { type: String, enum: ['GENERAL', 'LAB_ONLY'], default: 'GENERAL', required: true },
    asset_type: { type: String, enum: ['ASSET', 'CONSUMABLE'], default: 'ASSET', required: true },
    search_terms: { type: [String], default: undefined, select: false },
  },
  baseSchemaOptions
);

CategorySchema.pre('validate', function (next) {
  this.search_terms = buildSearchTerms([this.name]);
  next();
});

CategorySchema.index({ scope: 1 });
CategorySchema.index({ asset_type: 1 });
CategorySchema.index({ name: 1 });
CategorySchema.index({ scope: 1, name: 1 });
CategorySchema.index({ asset_type: 1, name: 1 });
CategorySchema.index({ search_terms: 1, scope: 1, asset_type: 1, name: 1 });

export const CategoryModel = mongoose.model<any>('Category', CategorySchema);


