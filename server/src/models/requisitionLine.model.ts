import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const REQUISITION_LINE_TYPES = ['MOVEABLE', 'CONSUMABLE'] as const;
const REQUISITION_LINE_STATUSES = [
  'PENDING_ASSIGNMENT',
  'ASSIGNED',
  'PARTIALLY_ASSIGNED',
  'NOT_AVAILABLE',
  'CANCELLED',
] as const;

const RequisitionLineSchema = new Schema(
  {
    requisition_id: { type: Schema.Types.ObjectId, ref: 'Requisition', required: true },
    line_type: { type: String, enum: REQUISITION_LINE_TYPES, required: true },
    requested_name: { type: String, required: true, trim: true },
    requested_quantity: { type: Number, min: 1, default: 1 },
    approved_quantity: { type: Number, min: 0, default: null },
    fulfilled_quantity: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: REQUISITION_LINE_STATUSES, default: 'PENDING_ASSIGNMENT' },
    notes: { type: String, default: null },
  },
  baseSchemaOptions
);

RequisitionLineSchema.pre('validate', function (next) {
  if (this.approved_quantity === null || this.approved_quantity === undefined) {
    this.approved_quantity = this.requested_quantity ?? 1;
  }
  next();
});

RequisitionLineSchema.index({ requisition_id: 1, created_at: 1 });
RequisitionLineSchema.index({ requisition_id: 1, status: 1, created_at: -1 });
RequisitionLineSchema.index({ status: 1, created_at: -1 });
RequisitionLineSchema.index({ created_at: -1 });

export const RequisitionLineModel = mongoose.model('RequisitionLine', RequisitionLineSchema);
