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

const RequisitionLineSchema = new Schema<any>(
  {
    requisition_id: { type: Schema.Types.ObjectId, ref: 'Requisition', required: true },
    line_type: { type: String, enum: REQUISITION_LINE_TYPES, required: true },
    asset_id: { type: Schema.Types.ObjectId, ref: 'Asset', default: null },
    consumable_id: { type: Schema.Types.ObjectId, ref: 'ConsumableItem', default: null },
    requested_name: { type: String, required: true, trim: true },
    mapped_name: { type: String, default: null, trim: true },
    mapped_by_user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    mapped_at: { type: Date, default: null },
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

  // Allow free-text employee submissions and enforce only cross-type consistency.
  if (this.line_type === 'MOVEABLE' && this.consumable_id) {
    this.invalidate('consumable_id', 'consumable_id must be null for MOVEABLE lines');
  }
  if (this.line_type === 'CONSUMABLE' && this.asset_id) {
    this.invalidate('asset_id', 'asset_id must be null for CONSUMABLE lines');
  }
  next();
});

RequisitionLineSchema.index({ requisition_id: 1, created_at: 1 });
RequisitionLineSchema.index({ requisition_id: 1, status: 1, created_at: -1 });
RequisitionLineSchema.index({ status: 1, created_at: -1 });
RequisitionLineSchema.index({ created_at: -1 });

export const RequisitionLineModel = mongoose.model<any>('RequisitionLine', RequisitionLineSchema);


