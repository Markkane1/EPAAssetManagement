import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const AssignmentSchema = new Schema(
  {
    asset_item_id: { type: Schema.Types.ObjectId, ref: 'AssetItem', required: true },
    employee_id: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    assigned_date: { type: String, required: true },
    expected_return_date: { type: String, default: null },
    returned_date: { type: String, default: null },
    notes: { type: String, default: null },
    is_active: { type: Boolean, default: true },
  },
  baseSchemaOptions
);

export const AssignmentModel = mongoose.model('Assignment', AssignmentSchema);
