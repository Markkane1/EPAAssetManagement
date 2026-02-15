import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const EmployeeSchema = new Schema<any>(
  {
    first_name: { type: String, required: true, trim: true },
    last_name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true },
    user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    phone: { type: String, default: null },
    job_title: { type: String, default: null },
    hire_date: { type: String, default: null },
    directorate_id: { type: Schema.Types.ObjectId, ref: 'Office', default: null },
    location_id: { type: Schema.Types.ObjectId, ref: 'Office', default: null },
    transferred_at: { type: Date, default: null },
    transferred_from_office_id: { type: Schema.Types.ObjectId, ref: 'Office', default: null },
    transferred_to_office_id: { type: Schema.Types.ObjectId, ref: 'Office', default: null },
    transfer_reason: { type: String, default: null, trim: true },
    is_active: { type: Boolean, default: true },
  },
  baseSchemaOptions
);

EmployeeSchema.index({ location_id: 1, created_at: -1 });
EmployeeSchema.index({ directorate_id: 1, location_id: 1, created_at: -1 });
EmployeeSchema.index({ transferred_to_office_id: 1, transferred_at: -1 });
EmployeeSchema.index({ transferred_from_office_id: 1, transferred_at: -1 });

export const EmployeeModel = mongoose.model('Employee', EmployeeSchema);

