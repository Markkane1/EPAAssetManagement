import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const StoreSchema = new Schema<any>(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true },
    is_system: { type: Boolean, default: false },
    is_active: { type: Boolean, default: true },
  },
  baseSchemaOptions
);

StoreSchema.index({ code: 1 }, { unique: true });
StoreSchema.index({ is_active: 1 });
StoreSchema.index({ is_system: 1 });

export const StoreModel = mongoose.model<any>('Store', StoreSchema);


