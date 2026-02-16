import { Request, Response, NextFunction } from 'express';
import { ConsumableLotModel } from '../models/consumableLot.model';
import { mapFields, pickDefined } from '../../../utils/mapFields';
import { createHttpError } from '../utils/httpError';
import type { AuthRequest } from '../../../middleware/auth';
import { OfficeModel } from '../../../models/office.model';
import { StoreModel } from '../../../models/store.model';
import { CategoryModel } from '../../../models/category.model';
import { ConsumableItemModel } from '../models/consumableItem.model';
import { roundQty, validateQtyInput } from '../services/balance.service';

const fieldMap = {
  consumableId: 'consumable_id',
  holderType: 'holder_type',
  holderId: 'holder_id',
  batchNo: 'batch_no',
  receivedAt: 'received_at',
  expiryDate: 'expiry_date',
  qtyReceived: 'qty_received',
  qtyAvailable: 'qty_available',
  notes: 'notes',
  documentId: 'document_id',
  supplierId: 'supplier_id',
};

const HEAD_OFFICE_STORE_CODE = 'HEAD_OFFICE_STORE';

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseBooleanFlag(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n'].includes(normalized)) return false;
  return fallback;
}

function buildPayload(body: Record<string, unknown>) {
  const payload = mapFields(body, fieldMap);
  Object.values(fieldMap).forEach((dbKey) => {
    if (body[dbKey] !== undefined) {
      payload[dbKey] = body[dbKey];
    }
  });
  if (body.docs !== undefined) {
    payload.docs = body.docs;
  }
  return pickDefined(payload);
}

async function resolveConsumableScope(consumableId: string) {
  const moduleItem = await ConsumableItemModel.findById(consumableId).lean();
  if (!moduleItem) {
    throw createHttpError(404, 'Consumable item not found');
  }
  const categoryId = (moduleItem as any).category_id;
  if (!categoryId) return { categoryScope: 'GENERAL' as const };
  const category = await CategoryModel.findById(categoryId).lean();
  return {
    categoryScope: ((category as any)?.scope || 'GENERAL') as 'GENERAL' | 'LAB_ONLY',
  };
}

async function enforceLabOnlyHolder(holderType: 'STORE' | 'OFFICE', holderId: string) {
  if (holderType === 'OFFICE') {
    const office = await OfficeModel.findById(holderId).lean();
    if (!office) throw createHttpError(404, 'Office not found');
    if ((office as any).type !== 'DISTRICT_LAB') {
      throw createHttpError(400, 'LAB_ONLY consumables can only be received into DISTRICT_LAB offices');
    }
    return;
  }

  const holderStore = await StoreModel.findById(holderId).lean();
  if (!holderStore) throw createHttpError(404, 'Store not found');
  const headOfficeStore = await StoreModel.findOne({ code: HEAD_OFFICE_STORE_CODE }).lean();
  if (!headOfficeStore) throw createHttpError(500, 'HEAD_OFFICE_STORE is not configured');
  if (String((holderStore as any)._id) !== String((headOfficeStore as any)._id)) {
    throw createHttpError(400, 'LAB_ONLY consumables can only be received into HEAD_OFFICE_STORE when holder_type is STORE');
  }
}

export const consumableLotController = {
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter: Record<string, unknown> = {};
      if (req.query.holder_type) filter.holder_type = String(req.query.holder_type).toUpperCase();
      if (req.query.holder_id) filter.holder_id = req.query.holder_id;
      if (req.query.consumable_id) filter.consumable_id = req.query.consumable_id;
      if (req.query.supplier_id) filter.supplier_id = req.query.supplier_id;
      if (req.query.batch_no) filter.batch_no = req.query.batch_no;
      if (!parseBooleanFlag(req.query.include_zero, false)) {
        (filter as any).$or = [{ qty_available: { $gt: 0 } }, { qty_available: { $exists: false } }];
      }
      const limit = clampInt((req.query as Record<string, unknown>).limit, 500, 1, 2000);
      const page = clampInt((req.query as Record<string, unknown>).page, 1, 1, 100000);
      const skip = (page - 1) * limit;
      const lots = await ConsumableLotModel.find(filter)
        .sort({ expiry_date: 1, received_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      res.json(lots);
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const lot = await ConsumableLotModel.findById(req.params.id).lean();
      if (!lot) return res.status(404).json({ message: 'Not found' });
      return res.json(lot);
    } catch (error) {
      next(error);
    }
  },
  receive: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const body = req.body as Record<string, unknown>;
      const holderType = String(body.holder_type || '').trim().toUpperCase();
      if (holderType !== 'OFFICE' && holderType !== 'STORE') {
        throw createHttpError(400, 'holder_type must be OFFICE or STORE');
      }
      const holderId = String(body.holder_id || '').trim();
      if (!holderId) throw createHttpError(400, 'holder_id is required');

      const consumableId = String(body.consumable_id || '').trim();
      if (!consumableId) throw createHttpError(400, 'consumable_id is required');

      const batchNo = String(body.batch_no || '').trim();
      if (!batchNo) throw createHttpError(400, 'batch_no is required');

      const expiryDateInput = String(body.expiry_date || '').trim();
      const expiryDate = new Date(expiryDateInput);
      if (!expiryDateInput || Number.isNaN(expiryDate.getTime())) {
        throw createHttpError(400, 'expiry_date must be a valid date');
      }

      const qtyReceived = roundQty(validateQtyInput(Number(body.qty_received)));
      const { categoryScope } = await resolveConsumableScope(consumableId);
      if (categoryScope === 'LAB_ONLY') {
        await enforceLabOnlyHolder(holderType as 'OFFICE' | 'STORE', holderId);
      }

      if (holderType === 'OFFICE') {
        const office = await OfficeModel.findById(holderId).lean();
        if (!office) throw createHttpError(404, 'Office not found');
      } else {
        const store = await StoreModel.findById(holderId).lean();
        if (!store) throw createHttpError(404, 'Store not found');
      }

      const receivedAtInput = String(body.received_at || '').trim();
      const receivedAt = receivedAtInput ? new Date(receivedAtInput) : new Date();
      if (Number.isNaN(receivedAt.getTime())) {
        throw createHttpError(400, 'received_at must be a valid date');
      }
      const lot = await ConsumableLotModel.create({
        consumable_id: consumableId,
        holder_type: holderType,
        holder_id: holderId,
        batch_no: batchNo,
        expiry_date: expiryDate,
        qty_received: qtyReceived,
        qty_available: qtyReceived,
        received_at: receivedAt,
        received_by_user_id: userId,
        notes: body.notes ?? null,
        supplier_id: body.supplier_id ?? null,
        document_id: body.document_id ?? null,
        docs: body.docs ?? undefined,
      });

      res.status(201).json(lot);
    } catch (error) {
      next(error);
    }
  },
  create: async (req: AuthRequest, res: Response, next: NextFunction) => {
    return consumableLotController.receive(req, res, next);
  },
  update: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = buildPayload(req.body);
      const lot = await ConsumableLotModel.findByIdAndUpdate(req.params.id, payload, { new: true });
      if (!lot) return res.status(404).json({ message: 'Not found' });
      return res.json(lot);
    } catch (error) {
      next(error);
    }
  },
  remove: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const lot = await ConsumableLotModel.findByIdAndDelete(req.params.id);
      if (!lot) return res.status(404).json({ message: 'Not found' });
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
