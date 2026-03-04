import fs from 'fs/promises';
import path from 'path';
import type { Express, NextFunction, Request, Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { PurchaseOrderModel } from '../models/purchaseOrder.model';
import { VendorModel } from '../models/vendor.model';
import { ProjectModel } from '../models/project.model';
import { SchemeModel } from '../models/scheme.model';
import { OfficeModel } from '../models/office.model';
import { mapFields } from '../utils/mapFields';
import { createHttpError } from '../utils/httpError';
import { assertUploadedFileIntegrity } from '../utils/uploadValidation';
import { getRequestContext } from '../utils/scope';
import { createBulkNotifications, resolveNotificationRecipientsByOffice } from '../services/notification.service';

type RequestWithFile = Request & {
  file?: Express.Multer.File;
};

const fieldMap = {
  orderNumber: 'order_number',
  orderDate: 'order_date',
  expectedDeliveryDate: 'expected_delivery_date',
  deliveredDate: 'delivered_date',
  totalAmount: 'total_amount',
  unitPrice: 'unit_price',
  taxPercentage: 'tax_percentage',
  taxAmount: 'tax_amount',
  sourceType: 'source_type',
  sourceName: 'source_name',
  vendorId: 'vendor_id',
  projectId: 'project_id',
  schemeId: 'scheme_id',
};

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function readPagination(query: Record<string, unknown>) {
  const limit = clampInt(query.limit, 1000, 1, 2000);
  const page = clampInt(query.page, 1, 1, 100000);
  const skip = (page - 1) * limit;
  return { limit, skip };
}

function parseRequestBody(req: RequestWithFile) {
  const payload = req.body?.payload;
  if (!payload) return req.body || {};
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload);
    } catch {
      throw createHttpError(400, 'Invalid purchase order payload');
    }
  }
  return payload;
}

function asNullableString(value: unknown) {
  const normalized = String(value ?? '').trim();
  return normalized.length ? normalized : null;
}

function asNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw createHttpError(400, 'Numeric fields must be valid numbers');
  }
  return parsed;
}

function buildPayload(body: Record<string, unknown>) {
  const payload = mapFields(body, fieldMap);
  Object.values(fieldMap).forEach((dbKey) => {
    if (body[dbKey] !== undefined) {
      payload[dbKey] = body[dbKey];
    }
  });
  if (body.status !== undefined) payload.status = body.status;
  if (body.notes !== undefined) payload.notes = body.notes;

  payload.source_name = asNullableString(payload.source_name);
  payload.vendor_id = asNullableString(payload.vendor_id);
  payload.project_id = asNullableString(payload.project_id);
  payload.scheme_id = asNullableString(payload.scheme_id);
  payload.total_amount = asNullableNumber(payload.total_amount);
  payload.unit_price = asNullableNumber(payload.unit_price);
  payload.tax_percentage = asNullableNumber(payload.tax_percentage);
  payload.tax_amount = asNullableNumber(payload.tax_amount);
  payload.order_date = asNullableString(payload.order_date);
  payload.expected_delivery_date = asNullableString(payload.expected_delivery_date);
  payload.delivered_date = asNullableString(payload.delivered_date);
  return payload;
}

function validateMonetaryFields(payload: Record<string, unknown>) {
  const numericFields: Array<{ key: string; label: string }> = [
    { key: 'total_amount', label: 'Total amount' },
    { key: 'unit_price', label: 'Unit price' },
    { key: 'tax_percentage', label: 'Tax percentage' },
    { key: 'tax_amount', label: 'Tax amount' },
  ];

  for (const field of numericFields) {
    if (payload[field.key] === null || payload[field.key] === undefined) continue;
    const value = Number(payload[field.key]);
    if (!Number.isFinite(value)) {
      throw createHttpError(400, `${field.label} must be a valid number`);
    }
    if (value < 0) {
      throw createHttpError(400, `${field.label} cannot be negative`);
    }
  }
}

async function validateSourceRelations(payload: Record<string, unknown>) {
  const sourceType = String(payload.source_type || '').trim().toLowerCase();
  if (sourceType !== 'procurement' && sourceType !== 'project') {
    throw createHttpError(400, "source_type must be 'procurement' or 'project'");
  }
  payload.source_type = sourceType;

  if (!payload.source_name) {
    throw createHttpError(400, 'Name of procurement / project is required');
  }

  if (sourceType === 'procurement') {
    if (!payload.vendor_id) {
      throw createHttpError(400, 'vendor_id is required for procurement purchase orders');
    }
    const vendorExists = await VendorModel.exists({ _id: payload.vendor_id });
    if (!vendorExists) {
      throw createHttpError(400, 'Selected vendor does not exist');
    }
    payload.project_id = null;
    payload.scheme_id = null;
    return;
  }

  if (!payload.project_id) {
    throw createHttpError(400, 'project_id is required for project purchase orders');
  }
  if (!payload.scheme_id) {
    throw createHttpError(400, 'scheme_id is required for project purchase orders');
  }

  const [project, scheme] = (await Promise.all([
    ProjectModel.findById(payload.project_id, { _id: 1 }).lean(),
    SchemeModel.findById(payload.scheme_id, { _id: 1, project_id: 1 }).lean(),
  ])) as [any, any];
  if (!project) {
    throw createHttpError(400, 'Selected project does not exist');
  }
  if (!scheme) {
    throw createHttpError(400, 'Selected scheme does not exist');
  }
  if (String(scheme.project_id || '') !== String(project._id)) {
    throw createHttpError(400, 'Selected scheme does not belong to selected project');
  }

  payload.vendor_id = null;
}

function buildAttachmentPayload(file?: Express.Multer.File) {
  if (!file) return {};
  const relativePath = path.join('uploads', 'documents', path.basename(file.path)).replace(/\\/g, '/');
  return {
    attachment_file_name: file.originalname,
    attachment_mime_type: file.mimetype,
    attachment_size_bytes: file.size,
    attachment_path: relativePath,
  };
}

async function ensurePdfUpload(file?: Express.Multer.File) {
  if (!file) return;
  await assertUploadedFileIntegrity(file, 'purchaseOrderAttachment');
  if (file.mimetype !== 'application/pdf') {
    throw createHttpError(400, 'purchaseOrderAttachment must be a PDF file');
  }
}

async function cleanupUpload(file?: Express.Multer.File) {
  if (!file?.path) return;
  try {
    await fs.unlink(file.path);
  } catch {
    // ignore cleanup failures
  }
}

function isObjectId(value: unknown) {
  return /^[0-9a-fA-F]{24}$/.test(String(value || '').trim());
}

async function resolvePurchaseOrderOfficeId(orderLike: any, fallbackOfficeId: string | null) {
  const vendorId = String(orderLike?.vendor_id || '').trim();
  if (isObjectId(vendorId)) {
    const vendor: any = await VendorModel.findById(vendorId, { office_id: 1 }).lean();
    const officeId = vendor?.office_id ? String(vendor.office_id) : null;
    if (officeId && isObjectId(officeId)) return officeId;
  }
  if (fallbackOfficeId && isObjectId(fallbackOfficeId)) return fallbackOfficeId;
  return null;
}

async function dispatchPurchaseOrderNotifications(input: {
  officeId: string | null;
  purchaseOrderId: string;
  type: 'PURCHASE_ORDER_CREATED' | 'PURCHASE_ORDER_STATUS_CHANGED' | 'PURCHASE_ORDER_REMOVED';
  title: string;
  message: string;
  excludeUserIds?: string[];
}) {
  if (!input.officeId || !isObjectId(input.officeId) || !isObjectId(input.purchaseOrderId)) return;

  const recipients = await resolveNotificationRecipientsByOffice({
    officeIds: [input.officeId],
    includeOrgAdmins: true,
    includeRoles: ['office_head', 'caretaker'],
    excludeUserIds: input.excludeUserIds || [],
  });
  if (recipients.length === 0) return;

  await createBulkNotifications(
    recipients.map((recipientUserId) => ({
      recipientUserId,
      officeId: input.officeId as string,
      type: input.type,
      title: input.title,
      message: input.message,
      entityType: 'PurchaseOrder',
      entityId: input.purchaseOrderId,
      dedupeWindowHours: 12,
    }))
  );
}

async function assertProcurementScope(ctx: { role: string; isOrgAdmin: boolean; locationId: string | null }) {
  if (ctx.isOrgAdmin) return;
  if (ctx.role !== 'office_head' && ctx.role !== 'procurement_officer') return;
  if (!ctx.locationId || !isObjectId(ctx.locationId)) {
    throw createHttpError(403, 'Procurement role requires an assigned office');
  }
  const office: any = await OfficeModel.findById(ctx.locationId, { _id: 1, type: 1, is_active: 1 }).lean();
  const officeType = String(office?.type || '').trim().toUpperCase();
  if (!office?._id || office?.is_active === false) {
    throw createHttpError(403, 'Assigned office is inactive');
  }
  if (officeType === 'DIRECTORATE') {
    throw createHttpError(403, 'Procurement actions are not allowed for directorate offices');
  }
}

export const purchaseOrderController = {
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { limit, skip } = readPagination(req.query as Record<string, unknown>);
      const orders = await PurchaseOrderModel.find()
        .sort({ order_date: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      res.json(orders);
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const order = await PurchaseOrderModel.findById(req.params.id).lean();
      if (!order) return res.status(404).json({ message: 'Not found' });
      return res.json(order);
    } catch (error) {
      next(error);
    }
  },
  getByVendor: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { limit, skip } = readPagination(req.query as Record<string, unknown>);
      const orders = await PurchaseOrderModel.find({ vendor_id: req.params.vendorId })
        .sort({ order_date: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      res.json(orders);
    } catch (error) {
      next(error);
    }
  },
  getByProject: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { limit, skip } = readPagination(req.query as Record<string, unknown>);
      const orders = await PurchaseOrderModel.find({ project_id: req.params.projectId })
        .sort({ order_date: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      res.json(orders);
    } catch (error) {
      next(error);
    }
  },
  getPending: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { limit, skip } = readPagination(req.query as Record<string, unknown>);
      const orders = await PurchaseOrderModel.find({ status: { $in: ['Draft', 'Pending'] } })
        .sort({ order_date: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      res.json(orders);
    } catch (error) {
      next(error);
    }
  },
  create: async (req: RequestWithFile, res: Response, next: NextFunction) => {
    const uploadedFile = req.file;
    try {
      await ensurePdfUpload(uploadedFile);
      const ctx = await getRequestContext(req as AuthRequest);
      await assertProcurementScope(ctx);
      const body = parseRequestBody(req);
      const payload = buildPayload(body);
      if (!payload.order_number) {
        payload.order_number = `PO-${Date.now()}`;
      }
      if (!payload.status) payload.status = 'Draft';
      if (!payload.source_type) payload.source_type = 'procurement';
      if (!payload.order_date) {
        throw createHttpError(400, 'Order date is required');
      }
      if (payload.total_amount === null || payload.total_amount === undefined) {
        throw createHttpError(400, 'Total amount is required');
      }

      validateMonetaryFields(payload);
      await validateSourceRelations(payload);

      const order = await PurchaseOrderModel.create({
        ...payload,
        ...buildAttachmentPayload(uploadedFile),
      });
      const officeId = await resolvePurchaseOrderOfficeId(order, ctx.locationId);
      await dispatchPurchaseOrderNotifications({
        officeId,
        purchaseOrderId: order.id,
        type: 'PURCHASE_ORDER_CREATED',
        title: 'Purchase Order Created',
        message: `Purchase order ${String(order.order_number || order.id)} was created.`,
        excludeUserIds: [ctx.userId],
      });
      res.status(201).json(order);
    } catch (error) {
      await cleanupUpload(uploadedFile);
      next(error);
    }
  },
  update: async (req: RequestWithFile, res: Response, next: NextFunction) => {
    const uploadedFile = req.file;
    try {
      await ensurePdfUpload(uploadedFile);
      const ctx = await getRequestContext(req as AuthRequest);
      await assertProcurementScope(ctx);
      const body = parseRequestBody(req);
      const payload = buildPayload(body);

      validateMonetaryFields(payload);
      if (payload.source_type || payload.source_name || payload.vendor_id || payload.project_id || payload.scheme_id) {
        await validateSourceRelations(payload);
      }

      const existingOrder = await PurchaseOrderModel.findById(req.params.id);
      if (!existingOrder) {
        await cleanupUpload(uploadedFile);
        return res.status(404).json({ message: 'Not found' });
      }
      const previousStatus = String(existingOrder.status || '');

      const updatePayload = {
        ...payload,
        ...(uploadedFile ? buildAttachmentPayload(uploadedFile) : {}),
      };

      const order = await PurchaseOrderModel.findByIdAndUpdate(req.params.id, updatePayload, { new: true });
      if (!order) {
        await cleanupUpload(uploadedFile);
        return res.status(404).json({ message: 'Not found' });
      }
      const nextStatus = String(order.status || '');
      if (previousStatus !== nextStatus) {
        const officeId = await resolvePurchaseOrderOfficeId(order, ctx.locationId);
        await dispatchPurchaseOrderNotifications({
          officeId,
          purchaseOrderId: order.id,
          type: 'PURCHASE_ORDER_STATUS_CHANGED',
          title: 'Purchase Order Status Updated',
          message: `Purchase order ${String(order.order_number || order.id)} changed from ${previousStatus || 'Unknown'} to ${nextStatus || 'Unknown'}.`,
          excludeUserIds: [ctx.userId],
        });
      }
      return res.json(order);
    } catch (error) {
      await cleanupUpload(uploadedFile);
      next(error);
    }
  },
  remove: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req as AuthRequest);
      await assertProcurementScope(ctx);
      const order = await PurchaseOrderModel.findByIdAndDelete(req.params.id);
      if (!order) return res.status(404).json({ message: 'Not found' });
      const officeId = await resolvePurchaseOrderOfficeId(order, ctx.locationId);
      await dispatchPurchaseOrderNotifications({
        officeId,
        purchaseOrderId: order.id,
        type: 'PURCHASE_ORDER_REMOVED',
        title: 'Purchase Order Removed',
        message: `Purchase order ${String(order.order_number || order.id)} was removed.`,
        excludeUserIds: [ctx.userId],
      });
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
