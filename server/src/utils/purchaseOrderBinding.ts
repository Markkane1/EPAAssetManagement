import type { ClientSession } from 'mongoose';
import { PurchaseOrderModel } from '../models/purchaseOrder.model';
import { createHttpError } from './httpError';

function normalizeOptionalId(value: unknown) {
  const normalized = String(value ?? '').trim();
  return normalized.length ? normalized : null;
}

type ResolveProcurementPurchaseOrderOptions = {
  purchaseOrderId: unknown;
  vendorId?: unknown;
  session?: ClientSession | null;
};

export async function resolveProcurementPurchaseOrderBinding(
  options: ResolveProcurementPurchaseOrderOptions
) {
  const purchaseOrderId = normalizeOptionalId(options.purchaseOrderId);
  const vendorId = normalizeOptionalId(options.vendorId);

  if (!purchaseOrderId) {
    return {
      purchaseOrderId: null,
      vendorId,
      purchaseOrder: null as any,
    };
  }

  let query = PurchaseOrderModel.findById(purchaseOrderId).select({
    _id: 1,
    source_type: 1,
    vendor_id: 1,
    unit_price: 1,
    order_number: 1,
  });
  if (options.session) {
    query = query.session(options.session);
  }

  const purchaseOrder: any = await query.lean();
  if (!purchaseOrder) {
    throw createHttpError(400, 'Selected purchase order does not exist');
  }

  const sourceType = String(purchaseOrder.source_type || '').trim().toLowerCase();
  if (sourceType !== 'procurement') {
    throw createHttpError(400, 'Only procurement purchase orders can be linked here');
  }

  const purchaseOrderVendorId = normalizeOptionalId(purchaseOrder.vendor_id);
  if (!purchaseOrderVendorId) {
    throw createHttpError(400, 'Selected purchase order is missing its vendor binding');
  }

  if (vendorId && vendorId !== purchaseOrderVendorId) {
    throw createHttpError(400, 'Selected purchase order does not belong to the chosen vendor');
  }

  return {
    purchaseOrderId: String(purchaseOrder._id),
    vendorId: purchaseOrderVendorId,
    purchaseOrder,
  };
}

export function assertPurchaseOrderAllowedForSource(
  sourceType: unknown,
  purchaseOrderId: unknown,
  subjectLabel: string
) {
  const normalizedSourceType = String(sourceType || '').trim().toLowerCase();
  if (!normalizeOptionalId(purchaseOrderId)) {
    return;
  }
  if (normalizedSourceType && normalizedSourceType !== 'procurement') {
    throw createHttpError(400, `${subjectLabel} can only be linked to procurement entries`);
  }
}
