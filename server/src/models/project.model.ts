import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

function isValidDateString(value: unknown) {
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
}

const ProjectSchema = new Schema<any>(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, default: null },
    description: { type: String, default: null },
    start_date: {
      type: String,
      required: [true, 'startDate is required'],
      validate: {
        validator: isValidDateString,
        message: 'startDate is invalid',
      },
    },
    end_date: {
      type: String,
      required: [true, 'endDate is required'],
      validate: {
        validator: isValidDateString,
        message: 'endDate is invalid',
      },
    },
    budget: { type: Number, default: null },
    is_active: { type: Boolean, default: true },
  },
  baseSchemaOptions
);

ProjectSchema.pre('validate', function (next) {
  const start = new Date(String(this.start_date ?? ''));
  const end = new Date(String(this.end_date ?? ''));
  if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start >= end) {
    this.invalidate('end_date', 'endDate must be later than startDate');
  }
  next();
});

ProjectSchema.index({ is_active: 1, created_at: -1 });
ProjectSchema.index({ created_at: -1 });
ProjectSchema.index({ name: 1, is_active: 1 });

export const ProjectModel = mongoose.model<any>('Project', ProjectSchema);


