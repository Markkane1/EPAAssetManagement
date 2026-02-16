import fs from 'fs/promises';
import path from 'path';
import { Response, NextFunction } from 'express';
import type { Express } from 'express';
import { AssetModel } from '../models/asset.model';
import { AssetItemModel } from '../models/assetItem.model';
import { mapFields } from '../utils/mapFields';
import { resolveAccessContext } from '../utils/accessControl';
import { createHttpError } from '../utils/httpError';
import type { AuthRequest } from '../middleware/auth';
import { officeAssetItemFilter } from '../utils/assetHolder';
import { assertUploadedFileIntegrity } from '../utils/uploadValidation';

const fieldMap = {
  categoryId: 'category_id',
  vendorId: 'vendor_id',
  purchaseOrderId: 'purchase_order_id',
  projectId: 'project_id',
  acquisitionDate: 'acquisition_date',
  unitPrice: 'unit_price',
  price: 'unit_price',
  assetSource: 'asset_source',
  schemeId: 'scheme_id',
  isActive: 'is_active',
  specification: 'specification',
};

const DIMENSION_UNITS = new Set(['mm', 'cm', 'm', 'in', 'ft']);

type AuthRequestWithFile = AuthRequest & {
  file?: Express.Multer.File;
};

function resolveStoredFileAbsolutePath(storedPath: string) {
  const normalized = storedPath.replace(/\\/g, '/');
  const absolutePath = path.resolve(process.cwd(), normalized);
  const uploadsRoot = path.resolve(process.cwd(), 'uploads');
  if (!absolutePath.startsWith(uploadsRoot)) {
    throw createHttpError(400, 'Invalid file path');
  }
  return absolutePath;
}

function buildAttachmentPayload(file: Express.Multer.File) {
  const relativePath = path.join('uploads', 'documents', path.basename(file.path)).replace(/\\/g, '/');
  return {
    attachment_file_name: file.originalname,
    attachment_mime_type: file.mimetype,
    attachment_size_bytes: file.size,
    attachment_path: relativePath,
  };
}

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

function normalizeNullableString(value: unknown) {
  if (value === undefined) return undefined;
  const normalized = String(value ?? '').trim();
  return normalized ? normalized : null;
}

function parseNullableNumber(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDimensions(body: Record<string, unknown>) {
  const dimensionsRaw = body.dimensions;
  const nested = dimensionsRaw && typeof dimensionsRaw === 'object'
    ? (dimensionsRaw as Record<string, unknown>)
    : {};

  const hasDimensionsPayload =
    body.dimensions !== undefined
    || body.dimensionLength !== undefined
    || body.dimensionWidth !== undefined
    || body.dimensionHeight !== undefined
    || body.dimensionUnit !== undefined
    || body.dimensions_length !== undefined
    || body.dimensions_width !== undefined
    || body.dimensions_height !== undefined
    || body.dimensions_unit !== undefined;

  if (!hasDimensionsPayload) return undefined;

  const unitCandidate = String(
    nested.unit
      ?? body.dimensionUnit
      ?? body.dimensions_unit
      ?? 'cm'
  ).toLowerCase();
  const unit = DIMENSION_UNITS.has(unitCandidate) ? unitCandidate : 'cm';

  return {
    length: parseNullableNumber(nested.length ?? body.dimensionLength ?? body.dimensions_length),
    width: parseNullableNumber(nested.width ?? body.dimensionWidth ?? body.dimensions_width),
    height: parseNullableNumber(nested.height ?? body.dimensionHeight ?? body.dimensions_height),
    unit,
  };
}

function buildPayload(body: Record<string, unknown>) {
  const payload = mapFields(body, fieldMap);
  Object.values(fieldMap).forEach((dbKey) => {
    if (body[dbKey] !== undefined) {
      payload[dbKey] = body[dbKey];
    }
  });

  if (body.name !== undefined) payload.name = body.name;
  if (body.description !== undefined) payload.description = body.description;
  if (body.specification !== undefined) payload.specification = normalizeNullableString(body.specification);
  if (body.currency !== undefined) payload.currency = body.currency;
  if (body.quantity !== undefined) payload.quantity = body.quantity;
  if (payload.acquisition_date) {
    payload.acquisition_date = new Date(String(payload.acquisition_date));
  }
  const dimensions = parseDimensions(body);
  if (dimensions !== undefined) {
    payload.dimensions = dimensions;
  }
  if (payload.vendor_id === "") payload.vendor_id = null;
  if (payload.project_id === "") payload.project_id = null;
  if (payload.scheme_id === "") payload.scheme_id = null;

  return payload;
}

export const assetController = {
  list: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { limit, skip } = readPagination(req.query as Record<string, unknown>);
      const access = await resolveAccessContext(req.user);
      if (access.isOrgAdmin) {
        const assets = await AssetModel.find({ is_active: { $ne: false } })
          .sort({ name: 1 })
          .skip(skip)
          .limit(limit)
          .lean();
        return res.json(assets);
      }
      if (!access.officeId) throw createHttpError(403, 'User is not assigned to an office');
      const assetIds = await AssetItemModel.distinct('asset_id', {
        ...officeAssetItemFilter(access.officeId),
        is_active: { $ne: false },
      });
      const assets = await AssetModel.find({ _id: { $in: assetIds }, is_active: { $ne: false } })
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean();
      res.json(assets);
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      const asset = (await AssetModel.findById(req.params.id).lean()) as ({ _id: unknown } & Record<string, unknown>) | null;
      if (!asset) return res.status(404).json({ message: 'Not found' });
      if (!access.isOrgAdmin) {
        if (!access.officeId) throw createHttpError(403, 'User is not assigned to an office');
        const hasItem = await AssetItemModel.exists({
          asset_id: asset._id,
          ...officeAssetItemFilter(access.officeId),
          is_active: { $ne: false },
        });
        if (!hasItem) throw createHttpError(403, 'Access restricted to assigned office inventory');
      }
      return res.json(asset);
    } catch (error) {
      next(error);
    }
  },
  getByCategory: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { limit, skip } = readPagination(req.query as Record<string, unknown>);
      const access = await resolveAccessContext(req.user);
      if (access.isOrgAdmin) {
        const assets = await AssetModel.find({ category_id: req.params.categoryId, is_active: { $ne: false } })
          .sort({ name: 1 })
          .skip(skip)
          .limit(limit)
          .lean();
        return res.json(assets);
      }
      if (!access.officeId) throw createHttpError(403, 'User is not assigned to an office');
      const assetIds = await AssetItemModel.distinct('asset_id', {
        ...officeAssetItemFilter(access.officeId),
        is_active: { $ne: false },
      });
      const assets = await AssetModel.find({
        _id: { $in: assetIds },
        category_id: req.params.categoryId,
        is_active: { $ne: false },
      })
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean();
      res.json(assets);
    } catch (error) {
      next(error);
    }
  },
  getByVendor: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { limit, skip } = readPagination(req.query as Record<string, unknown>);
      const access = await resolveAccessContext(req.user);
      if (access.isOrgAdmin) {
        const assets = await AssetModel.find({ vendor_id: req.params.vendorId, is_active: { $ne: false } })
          .sort({ name: 1 })
          .skip(skip)
          .limit(limit)
          .lean();
        return res.json(assets);
      }
      if (!access.officeId) throw createHttpError(403, 'User is not assigned to an office');
      const assetIds = await AssetItemModel.distinct('asset_id', {
        ...officeAssetItemFilter(access.officeId),
        is_active: { $ne: false },
      });
      const assets = await AssetModel.find({
        _id: { $in: assetIds },
        vendor_id: req.params.vendorId,
        is_active: { $ne: false },
      })
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean();
      res.json(assets);
    } catch (error) {
      next(error);
    }
  },
  create: async (req: AuthRequestWithFile, res: Response, next: NextFunction) => {
    const uploadedFile = req.file || null;
    try {
      const access = await resolveAccessContext(req.user);
      if (!access.isOrgAdmin) {
        throw createHttpError(403, 'Only org_admin can create asset definitions');
      }
      if (uploadedFile) {
        await assertUploadedFileIntegrity(uploadedFile, 'assetAttachment');
        if (uploadedFile.mimetype !== 'application/pdf') {
          throw createHttpError(400, 'assetAttachment must be a PDF file');
        }
      }
      const payload = buildPayload(req.body);
      if (uploadedFile) {
        Object.assign(payload, buildAttachmentPayload(uploadedFile));
      }
      if (payload.currency === undefined) payload.currency = 'PKR';
      if (payload.quantity === undefined) payload.quantity = 1;
      const asset = await AssetModel.create(payload);
      res.status(201).json(asset);
    } catch (error) {
      if (uploadedFile?.path) {
        try {
          await fs.unlink(uploadedFile.path);
        } catch {
          // ignore cleanup failures
        }
      }
      next(error);
    }
  },
  update: async (req: AuthRequestWithFile, res: Response, next: NextFunction) => {
    const uploadedFile = req.file || null;
    let oldAttachmentPath: string | null = null;
    try {
      const access = await resolveAccessContext(req.user);
      if (!access.isOrgAdmin) {
        throw createHttpError(403, 'Only org_admin can update asset definitions');
      }
      if (uploadedFile) {
        await assertUploadedFileIntegrity(uploadedFile, 'assetAttachment');
        if (uploadedFile.mimetype !== 'application/pdf') {
          throw createHttpError(400, 'assetAttachment must be a PDF file');
        }
      }
      const payload = buildPayload(req.body);
      if (uploadedFile) {
        Object.assign(payload, buildAttachmentPayload(uploadedFile));
      }

      const asset: any = await AssetModel.findById(req.params.id);
      if (!asset) return res.status(404).json({ message: 'Not found' });

      oldAttachmentPath = asset.attachment_path ? String(asset.attachment_path) : null;
      Object.assign(asset, payload);
      await asset.save();

      if (uploadedFile && oldAttachmentPath && oldAttachmentPath !== asset.attachment_path) {
        try {
          await fs.unlink(resolveStoredFileAbsolutePath(oldAttachmentPath));
        } catch {
          // ignore cleanup failures
        }
      }

      return res.json(asset);
    } catch (error) {
      if (uploadedFile?.path) {
        try {
          await fs.unlink(uploadedFile.path);
        } catch {
          // ignore cleanup failures
        }
      }
      next(error);
    }
  },
  remove: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      if (!access.isOrgAdmin) {
        throw createHttpError(403, 'Only org_admin can retire assets');
      }
      const asset = await AssetModel.findById(req.params.id);
      if (!asset) return res.status(404).json({ message: 'Not found' });
      asset.is_active = false;
      await asset.save();
      await AssetItemModel.updateMany(
        { asset_id: req.params.id },
        { is_active: false, item_status: 'Retired', assignment_status: 'Unassigned' }
      );
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};


