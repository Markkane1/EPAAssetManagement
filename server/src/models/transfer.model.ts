import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const TRANSFER_STATUSES = [
  'REQUESTED',
  'APPROVED',
  'DISPATCHED_TO_STORE',
  'RECEIVED_AT_STORE',
  'DISPATCHED_TO_DEST',
  'RECEIVED_AT_DEST',
  'REJECTED',
  'CANCELLED',
] as const;

const TransferLineSchema = new Schema<any>(
  {
    asset_item_id: { type: Schema.Types.ObjectId, ref: 'AssetItem', required: true },
    notes: { type: String, default: null },
  },
  { _id: false }
);

const TransferSchema = new Schema<any>(
  {
    // Deprecated single-line field kept for migration compatibility.
    asset_item_id: { type: Schema.Types.ObjectId, ref: 'AssetItem', default: null },
    // Multi-line transfer payload.
    lines: { type: [TransferLineSchema], default: [] },
    // Office the item is moving from
    from_office_id: { type: Schema.Types.ObjectId, ref: 'Office', required: true },
    // Office the item is moving to
    to_office_id: { type: Schema.Types.ObjectId, ref: 'Office', required: true },
    // Mandatory mediation store.
    store_id: { type: Schema.Types.ObjectId, ref: 'Store', default: null },
    // Date the transfer was initiated
    transfer_date: { type: Date, required: true },
    // User who handled the transfer action
    handled_by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // Optional requisition link
    requisition_id: { type: Schema.Types.ObjectId, ref: 'Requisition', default: null },
    // Required signed reports for each leg
    handover_document_id: { type: Schema.Types.ObjectId, ref: 'Document', default: null },
    takeover_document_id: { type: Schema.Types.ObjectId, ref: 'Document', default: null },
    // Workflow actors
    requested_by_user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approved_by_user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    dispatched_by_user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    received_by_user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    dispatched_to_store_by_user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    received_at_store_by_user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    dispatched_to_dest_by_user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    received_at_dest_by_user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    rejected_by_user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    cancelled_by_user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // Workflow timestamps
    requested_at: { type: Date, default: null },
    approved_at: { type: Date, default: null },
    dispatched_to_store_at: { type: Date, default: null },
    received_at_store_at: { type: Date, default: null },
    dispatched_to_dest_at: { type: Date, default: null },
    received_at_dest_at: { type: Date, default: null },
    rejected_at: { type: Date, default: null },
    cancelled_at: { type: Date, default: null },
    // Deprecated compatibility timestamps.
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
TransferSchema.index({ 'lines.asset_item_id': 1, transfer_date: -1 });
TransferSchema.index({ from_office_id: 1, transfer_date: -1 });
TransferSchema.index({ to_office_id: 1, transfer_date: -1 });
TransferSchema.index({ store_id: 1, transfer_date: -1 });
TransferSchema.index({ is_active: 1, transfer_date: -1 });
TransferSchema.index({ status: 1 });

export const TransferModel = mongoose.model<any>('Transfer', TransferSchema);


