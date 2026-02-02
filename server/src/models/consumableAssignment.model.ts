import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const ConsumableAssignmentSchema = new Schema(
  {
    consumable_id: { type: Schema.Types.ObjectId, ref: 'Consumable', required: true },
    assignee_type: { type: String, enum: ['employee', 'location'], required: true },
    assignee_id: { type: Schema.Types.ObjectId, required: true },
    received_by_employee_id: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
    quantity: { type: Number, required: true, min: 0 },
    input_quantity: { type: Number, default: null },
    input_unit: { type: String, default: null },
    assigned_date: { type: String, required: true },
    notes: { type: String, default: null },
  },
  baseSchemaOptions
);

export const ConsumableAssignmentModel = mongoose.model(
  'ConsumableAssignment',
  ConsumableAssignmentSchema
);
