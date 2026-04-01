import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import type { AuthRequest } from '../middleware/auth';
import { VendorModel } from '../models/vendor.model';
import { OfficeModel } from '../models/office.model';
import { createHttpError } from '../utils/httpError';
import { getRequestContext } from '../utils/scope';
import { logAudit } from '../modules/records/services/audit.service';
import { readPagination } from '../utils/requestParsing';
import { buildSearchTerms, buildSearchTermsQuery } from '../utils/searchTerms';
import { hasRoleCapability } from '../utils/roles';

const VENDOR_ALLOWED_ROLES = ['org_admin', 'office_head', 'caretaker', 'procurement_officer'];

function sanitizeVendorText(value: unknown) {
  return String(value || '')
    .replace(/on[a-z]+\s*=/gi, '')
    .replace(/javascript:/gi, '')
    .trim();
}

function readOfficeIdFromBody(body: Record<string, unknown>) {
  const raw = body.officeId ?? body.office_id;
  const parsed = String(raw || '').trim();
  return parsed || null;
}

function normalizeWritePayload(body: Record<string, unknown>) {
  const payload: Record<string, unknown> = {};
  if (body.name !== undefined) payload.name = sanitizeVendorText(body.name);
  if (body.contactInfo !== undefined) payload.contact_info = sanitizeVendorText(body.contactInfo);
  else if (body.contact_info !== undefined) payload.contact_info = sanitizeVendorText(body.contact_info);
  if (body.email !== undefined) payload.email = sanitizeVendorText(body.email);
  if (body.phone !== undefined) payload.phone = sanitizeVendorText(body.phone);
  if (body.address !== undefined) payload.address = sanitizeVendorText(body.address);
  return payload;
}

function resolveVendorSearchTerms(payload: Record<string, unknown>, existing?: Record<string, unknown> | null) {
  return buildSearchTerms([
    payload.name ?? existing?.name,
    payload.email ?? existing?.email,
    payload.phone ?? existing?.phone,
  ]);
}

async function ensureOfficeExists(officeId: string) {
  if (!Types.ObjectId.isValid(officeId)) {
    throw createHttpError(400, 'officeId is invalid');
  }
  const exists = await OfficeModel.exists({ _id: officeId });
  if (!exists) {
    throw createHttpError(400, 'Selected office does not exist');
  }
}

function ensureVendorAccess(roles: string[] | undefined, action: 'read' | 'manage') {
  if (hasRoleCapability(roles || [], VENDOR_ALLOWED_ROLES)) return;
  throw createHttpError(403, action === 'manage' ? 'Not permitted to manage vendors' : 'Not permitted to view vendors');
}

function ensureVendorOfficeScope(options: {
  isOrgAdmin: boolean;
  requesterOfficeId: string | null;
  vendorOfficeId: string | null;
}) {
  if (options.isOrgAdmin) return;
  if (!options.requesterOfficeId) {
    throw createHttpError(403, 'User is not assigned to an office');
  }
  if (!options.vendorOfficeId || options.vendorOfficeId !== options.requesterOfficeId) {
    throw createHttpError(403, 'Access restricted to assigned office');
  }
}

export const vendorController = {
  list: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      ensureVendorAccess(ctx.roles || [ctx.role], 'read');
      const query = req.query as Record<string, unknown>;
      const { page, limit, skip } = readPagination(query, { defaultLimit: 200, maxLimit: 1000 });
      const meta = String(query.meta || '').trim() === '1';
      const search = String(query.search || '').trim();
      const queryOfficeId = String(query.officeId || '').trim();

      const filter: Record<string, unknown> = {};
      if (search) {
        Object.assign(filter, buildSearchTermsQuery(search) || {});
      }

      if (ctx.isOrgAdmin) {
        if (queryOfficeId) {
          if (!Types.ObjectId.isValid(queryOfficeId)) {
            throw createHttpError(400, 'officeId is invalid');
          }
          filter.office_id = queryOfficeId;
        }
      } else {
        if (!ctx.locationId) {
          throw createHttpError(403, 'User is not assigned to an office');
        }
        if (queryOfficeId && queryOfficeId !== ctx.locationId) {
          throw createHttpError(403, 'Access restricted to assigned office');
        }
        filter.office_id = ctx.locationId;
      }

      const vendors = await VendorModel.find(
        filter,
        { name: 1, contact_info: 1, email: 1, phone: 1, address: 1, office_id: 1, created_at: 1 }
      )
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      if (!meta) {
        return res.json(vendors);
      }

      const total = await VendorModel.countDocuments(filter);
      return res.json({
        items: vendors,
        page,
        limit,
        total,
        hasMore: skip + vendors.length < total,
      });
    } catch (error) {
      next(error);
    }
  },

  getById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      ensureVendorAccess(ctx.roles || [ctx.role], 'read');
      const vendor: any = await VendorModel.findById(req.params?.id).lean();
      if (!vendor) {
        return res.status(404).json({ message: 'Not found' });
      }
      ensureVendorOfficeScope({
        isOrgAdmin: ctx.isOrgAdmin,
        requesterOfficeId: ctx.locationId,
        vendorOfficeId: vendor.office_id ? String(vendor.office_id) : null,
      });
      return res.json(vendor);
    } catch (error) {
      next(error);
    }
  },

  create: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      ensureVendorAccess(ctx.roles || [ctx.role], 'manage');

      const body = (req.body || {}) as Record<string, unknown>;
      const requestedOfficeId = readOfficeIdFromBody(body);

      let targetOfficeId: string | null = null;
      if (ctx.isOrgAdmin) {
        targetOfficeId = requestedOfficeId || ctx.locationId || null;
      } else {
        targetOfficeId = ctx.locationId;
        if (requestedOfficeId && requestedOfficeId !== targetOfficeId) {
          throw createHttpError(403, 'Access restricted to assigned office');
        }
      }

      if (!targetOfficeId) {
        throw createHttpError(400, 'officeId is required');
      }
      await ensureOfficeExists(targetOfficeId);

      const payload = normalizeWritePayload(body);
      payload.office_id = targetOfficeId;
      payload.search_terms = resolveVendorSearchTerms(payload);

      const vendor = await VendorModel.create(payload);
      try { await logAudit({ ctx, action: 'VENDOR_CREATED', entityType: 'Vendor', entityId: String(vendor._id), officeId: targetOfficeId }); } catch { /* audit failures must not surface */ }
      return res.status(201).json(vendor);
    } catch (error) {
      next(error);
    }
  },

  update: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      ensureVendorAccess(ctx.roles || [ctx.role], 'manage');

      const existing: any = await VendorModel.findById(req.params?.id);
      if (!existing) {
        return res.status(404).json({ message: 'Not found' });
      }
      const existingOfficeId = existing.office_id ? String(existing.office_id) : null;
      ensureVendorOfficeScope({
        isOrgAdmin: ctx.isOrgAdmin,
        requesterOfficeId: ctx.locationId,
        vendorOfficeId: existingOfficeId,
      });

      const body = (req.body || {}) as Record<string, unknown>;
      const requestedOfficeId = readOfficeIdFromBody(body);
      if (!ctx.isOrgAdmin && requestedOfficeId && requestedOfficeId !== existingOfficeId) {
        throw createHttpError(403, 'Access restricted to assigned office');
      }

      const payload = normalizeWritePayload(body);
      if (ctx.isOrgAdmin && requestedOfficeId && requestedOfficeId !== existingOfficeId) {
        await ensureOfficeExists(requestedOfficeId);
        payload.office_id = requestedOfficeId;
      }
      payload.search_terms = resolveVendorSearchTerms(payload, existing as Record<string, unknown>);

      const updated = await VendorModel.findByIdAndUpdate(req.params?.id, payload, {
        new: true,
        runValidators: true,
      });
      if (!updated) {
        return res.status(404).json({ message: 'Not found' });
      }
      const updatedOfficeId = String((updated as any).office_id || existingOfficeId || '');
      if (updatedOfficeId) {
        try { await logAudit({ ctx, action: 'VENDOR_UPDATED', entityType: 'Vendor', entityId: String(req.params?.id), officeId: updatedOfficeId }); } catch { /* audit failures must not surface */ }
      }
      return res.json(updated);
    } catch (error) {
      next(error);
    }
  },

  remove: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      ensureVendorAccess(ctx.roles || [ctx.role], 'manage');

      const vendor: any = await VendorModel.findById(req.params?.id).lean();
      if (!vendor) {
        return res.status(404).json({ message: 'Not found' });
      }
      ensureVendorOfficeScope({
        isOrgAdmin: ctx.isOrgAdmin,
        requesterOfficeId: ctx.locationId,
        vendorOfficeId: vendor.office_id ? String(vendor.office_id) : null,
      });

      await VendorModel.findByIdAndDelete(req.params?.id);
      const deleteOfficeId = vendor.office_id ? String(vendor.office_id) : null;
      if (deleteOfficeId) {
        try { await logAudit({ ctx, action: 'VENDOR_DELETED', entityType: 'Vendor', entityId: String(req.params?.id), officeId: deleteOfficeId }); } catch { /* audit failures must not surface */ }
      }
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
