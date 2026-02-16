import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const RateLimitEntrySchema = new Schema(
  {
    key: { type: String, required: true, trim: true },
    window_start: { type: Date, required: true },
    reset_at: { type: Date, required: true },
    expires_at: { type: Date, required: true },
    count: { type: Number, required: true, default: 0 },
  },
  baseSchemaOptions
);

RateLimitEntrySchema.index({ key: 1, window_start: 1 }, { unique: true });
RateLimitEntrySchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
RateLimitEntrySchema.index({ reset_at: 1 });

export type RateLimitEntryDoc = mongoose.InferSchemaType<typeof RateLimitEntrySchema>;

export const RateLimitEntryModel = mongoose.model<RateLimitEntryDoc>('RateLimitEntry', RateLimitEntrySchema);
