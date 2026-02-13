import { NextFunction, Response } from 'express';
import { Types } from 'mongoose';
import type { AuthRequest } from '../middleware/auth';
import { RequisitionModel } from '../models/requisition.model';
import { ReturnRequestModel } from '../models/returnRequest.model';
import { DocumentModel } from '../models/document.model';
import { createHttpError } from '../utils/httpError';
import { getRequestContext } from '../utils/scope';

function clampInt(value: unknown, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.floor(parsed), max));
}

function parseDateInput(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw createHttpError(400, `${fieldName} must be a valid date`);
  }
  return parsed;
}

function resolveScopedOfficeId(ctx: { isHeadoffice: boolean; locationId: string | null }, rawOfficeId: unknown) {
  const requestedOfficeId = rawOfficeId === undefined || rawOfficeId === null ? null : String(rawOfficeId).trim();
  if (requestedOfficeId && !Types.ObjectId.isValid(requestedOfficeId)) {
    throw createHttpError(400, 'officeId is invalid');
  }

  if (!ctx.isHeadoffice) {
    if (!ctx.locationId) throw createHttpError(403, 'User is not assigned to an office');
    if (requestedOfficeId && requestedOfficeId !== ctx.locationId) {
      throw createHttpError(403, 'Access restricted to assigned office');
    }
    return ctx.locationId;
  }

  return requestedOfficeId || null;
}

function applyCreatedAtRange(filter: Record<string, unknown>, from: Date | null, to: Date | null) {
  if (!from && !to) return;
  const createdRange: Record<string, Date> = {};
  if (from) createdRange.$gte = from;
  if (to) createdRange.$lte = to;
  filter.created_at = createdRange;
}

export const reportController = {
  requisitions: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      const page = clampInt(req.query.page, 1, 100_000);
      const limit = clampInt(req.query.limit, 200, 1000);
      const skip = (page - 1) * limit;
      const status = req.query.status ? String(req.query.status).trim() : null;
      const from = parseDateInput(req.query.from, 'from');
      const to = parseDateInput(req.query.to, 'to');
      if (from && to && from.getTime() > to.getTime()) {
        throw createHttpError(400, 'from must be earlier than or equal to to');
      }

      const officeId = resolveScopedOfficeId(ctx, req.query.officeId);
      const filter: Record<string, unknown> = {};
      if (officeId) filter.office_id = officeId;
      if (status) filter.status = status;
      applyCreatedAtRange(filter, from, to);

      const [items, total, statusRows] = await Promise.all([
        RequisitionModel.find(filter).sort({ created_at: -1 }).skip(skip).limit(limit).lean(),
        RequisitionModel.countDocuments(filter),
        RequisitionModel.aggregate<{ _id: string; count: number }>([
          { $match: filter },
          { $group: { _id: '$status', count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ]),
      ]);

      return res.json({
        page,
        limit,
        total,
        officeId,
        items,
        statusSummary: statusRows.map((row) => ({
          status: row._id || 'UNKNOWN',
          count: row.count,
        })),
      });
    } catch (error) {
      return next(error);
    }
  },
  noncompliance: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      const page = clampInt(req.query.page, 1, 100_000);
      const limit = clampInt(req.query.limit, 200, 1000);
      const skip = (page - 1) * limit;
      const from = parseDateInput(req.query.from, 'from');
      const to = parseDateInput(req.query.to, 'to');
      if (from && to && from.getTime() > to.getTime()) {
        throw createHttpError(400, 'from must be earlier than or equal to to');
      }

      const officeId = resolveScopedOfficeId(ctx, req.query.officeId);

      const requisitionFilter: Record<string, unknown> = {
        status: { $in: ['FULFILLED', 'FULFILLED_PENDING_SIGNATURE'] },
      };
      const returnRequestFilter: Record<string, unknown> = {
        status: { $in: ['CLOSED', 'CLOSED_PENDING_SIGNATURE'] },
      };
      if (officeId) {
        requisitionFilter.office_id = officeId;
        returnRequestFilter.office_id = officeId;
      }
      applyCreatedAtRange(requisitionFilter, from, to);
      applyCreatedAtRange(returnRequestFilter, from, to);

      const [requisitions, returnRequests] = await Promise.all([
        RequisitionModel.find(requisitionFilter).sort({ created_at: -1 }).lean(),
        ReturnRequestModel.find(returnRequestFilter).sort({ created_at: -1 }).lean(),
      ]);

      const requisitionDocIds = Array.from(
        new Set(
          requisitions
            .map((row) => (row.signed_issuance_document_id ? String(row.signed_issuance_document_id) : null))
            .filter((id): id is string => Boolean(id))
        )
      );
      const returnDocIds = Array.from(
        new Set(
          returnRequests
            .map((row) => (row.receipt_document_id ? String(row.receipt_document_id) : null))
            .filter((id): id is string => Boolean(id))
        )
      );

      const [issueSlipDocs, returnSlipDocs] = await Promise.all([
        requisitionDocIds.length
          ? DocumentModel.find(
              { _id: { $in: requisitionDocIds }, doc_type: 'IssueSlip', status: 'Final' },
              { _id: 1 }
            ).lean()
          : [],
        returnDocIds.length
          ? DocumentModel.find(
              { _id: { $in: returnDocIds }, doc_type: 'ReturnSlip', status: 'Final' },
              { _id: 1 }
            ).lean()
          : [],
      ]);

      const validIssueSlipDocIds = new Set(issueSlipDocs.map((row) => String(row._id)));
      const validReturnSlipDocIds = new Set(returnSlipDocs.map((row) => String(row._id)));

      const requisitionIssues = requisitions
        .filter((row) => {
          const signedDocId = row.signed_issuance_document_id ? String(row.signed_issuance_document_id) : null;
          if (!signedDocId || !row.signed_issuance_uploaded_at) return true;
          return !validIssueSlipDocIds.has(signedDocId);
        })
        .map((row) => ({
          type: 'REQUISITION',
          issue: 'MISSING_SIGNED_ISSUE_SLIP',
          id: row._id,
          office_id: row.office_id,
          status: row.status,
          file_number: row.file_number,
          signed_document_id: row.signed_issuance_document_id || null,
          created_at: row.created_at,
          updated_at: row.updated_at,
        }));

      const returnRequestIssues = returnRequests
        .filter((row) => {
          const signedDocId = row.receipt_document_id ? String(row.receipt_document_id) : null;
          if (!signedDocId) return true;
          return !validReturnSlipDocIds.has(signedDocId);
        })
        .map((row) => ({
          type: 'RETURN_REQUEST',
          issue: 'MISSING_SIGNED_RETURN_SLIP',
          id: row._id,
          office_id: row.office_id,
          status: row.status,
          signed_document_id: row.receipt_document_id || null,
          created_at: row.created_at,
          updated_at: row.updated_at,
        }));

      const combined = [...requisitionIssues, ...returnRequestIssues].sort((a, b) => {
        const aTime = new Date(String(a.created_at || 0)).getTime();
        const bTime = new Date(String(b.created_at || 0)).getTime();
        return bTime - aTime;
      });
      const paged = combined.slice(skip, skip + limit);

      return res.json({
        page,
        limit,
        total: combined.length,
        officeId,
        counts: {
          requisitionsWithoutSignedIssueSlip: requisitionIssues.length,
          returnRequestsWithoutSignedReturnSlip: returnRequestIssues.length,
          total: combined.length,
        },
        items: paged,
      });
    } catch (error) {
      return next(error);
    }
  },
};
