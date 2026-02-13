import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const TRANSFER_STATUSES = ['REQUESTED', 'APPROVED', 'DISPATCHED', 'RECEIVED'] as const;

const TransferSchema = new Schema(
  {
    // Asset item being moved between offices
    asset_item_id: { type: Schema.Types.ObjectId, ref: 'AssetItem', required: true },
    // Office the item is moving from
    from_office_id: { type: Schema.Types.ObjectId, ref: 'Office', required: true },
    // Office the item is moving to
    to_office_id: { type: Schema.Types.ObjectId, ref: 'Office', required: true },
    // Date the transfer was initiated
    transfer_date: { type: Date, required: true },
    // User who handled the transfer action
    handled_by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // Workflow actors
    requested_by_user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approved_by_user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    dispatched_by_user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    received_by_user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // Workflow timestamps
    requested_at: { type: Date, default: null },
    approved_at: { type: Date, default: null },
    dispatched_at: { type: Date, default: null },
    received_at: { type: Date, default: null },
    // Transfer workflow status
    status: { type: String, enum: TRANSFER_STATUSES, default: 'REQUESTED', required: true },
    // Notes for the transfer request or handling
    notes: { type: String, default: null },
    // Soft-active flag to preserve history
    is_active: { type: Boolean, default: true },
  },
  baseSchemaOptions
);

TransferSchema.index({ asset_item_id: 1, transfer_date: -1 });
TransferSchema.index({ from_office_id: 1, transfer_date: -1 });
TransferSchema.index({ to_office_id: 1, transfer_date: -1 });
TransferSchema.index({ is_active: 1, transfer_date: -1 });
TransferSchema.index({ status: 1 });

export const TransferModel = mongoose.model('Transfer', TransferSchema);
