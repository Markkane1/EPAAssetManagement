import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const AssignmentSchema = new Schema<any>(
  {
    // Asset item being assigned
    asset_item_id: { type: Schema.Types.ObjectId, ref: 'AssetItem', required: true },
    // Employee receiving the asset item
    employee_id: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    // Assignment start date
    assigned_date: { type: Date, required: true },
    // Expected return date for planning
    expected_return_date: { type: Date, default: null },
    // Actual return date when closed
    returned_date: { type: Date, default: null },
    // Notes related to this assignment
    notes: { type: String, default: null },
    // Only one active assignment per asset item
    is_active: { type: Boolean, default: true },
  },
  baseSchemaOptions
);

AssignmentSchema.index(
  { asset_item_id: 1, is_active: 1 },
  { unique: true, partialFilterExpression: { is_active: true } }
);
AssignmentSchema.index({ is_active: 1, assigned_date: -1 });
AssignmentSchema.index({ employee_id: 1, assigned_date: -1 });
AssignmentSchema.index({ asset_item_id: 1, assigned_date: -1 });
AssignmentSchema.index({ created_at: -1 });

export const AssignmentModel = mongoose.model('Assignment', AssignmentSchema);

