import { NextFunction, Response } from 'express';
import { Types } from 'mongoose';
import type { AuthRequest } from '../middleware/auth';
import { RequisitionModel } from '../models/requisition.model';
import { ReturnRequestModel } from '../models/returnRequest.model';
import { createHttpError } from '../utils/httpError';
import { getRequestContext } from '../utils/scope';
import { parseDateInput, readPagination } from '../utils/requestParsing';

function resolveScopedOfficeId(ctx: { isOrgAdmin: boolean; locationId: string | null }, rawOfficeId: unknown) {
  const requestedOfficeId = rawOfficeId === undefined || rawOfficeId === null ? null : String(rawOfficeId).trim();
  if (requestedOfficeId && !Types.ObjectId.isValid(requestedOfficeId)) {
    throw createHttpError(400, 'officeId is invalid');
  }

  if (!ctx.isOrgAdmin) {
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

function buildRequisitionNonCompliancePipeline(filter: Record<string, unknown>) {
  return [
    { $match: filter },
    {
      $lookup: {
        from: 'documents',
        let: { docId: '$signed_issuance_document_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$_id', '$$docId'] },
                  { $eq: ['$doc_type', 'IssueSlip'] },
                  { $eq: ['$status', 'Final'] },
                ],
              },
            },
          },
          { $project: { _id: 1 } },
        ],
        as: 'valid_signed_doc',
      },
    },
    {
      $match: {
        $or: [
          { signed_issuance_document_id: null },
          { signed_issuance_uploaded_at: null },
          { $expr: { $eq: [{ $size: '$valid_signed_doc' }, 0] } },
        ],
      },
    },
    {
      $project: {
        _id: 0,
        type: { $literal: 'REQUISITION' },
        issue: { $literal: 'MISSING_SIGNED_ISSUE_SLIP' },
        id: '$_id',
        office_id: '$office_id',
        status: '$status',
        file_number: '$file_number',
        signed_document_id: '$signed_issuance_document_id',
        created_at: '$created_at',
        updated_at: '$updated_at',
      },
    },
  ];
}

function buildReturnRequestNonCompliancePipeline(filter: Record<string, unknown>) {
  return [
    { $match: filter },
    {
      $lookup: {
        from: 'documents',
        let: { docId: '$receipt_document_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$_id', '$$docId'] },
                  { $eq: ['$doc_type', 'ReturnSlip'] },
                  { $eq: ['$status', 'Final'] },
                ],
              },
            },
          },
          { $project: { _id: 1 } },
        ],
        as: 'valid_signed_doc',
      },
    },
    {
      $match: {
        $or: [
          { receipt_document_id: null },
          { $expr: { $eq: [{ $size: '$valid_signed_doc' }, 0] } },
        ],
      },
    },
    {
      $project: {
        _id: 0,
        type: { $literal: 'RETURN_REQUEST' },
        issue: { $literal: 'MISSING_SIGNED_RETURN_SLIP' },
        id: '$_id',
        office_id: '$office_id',
        status: '$status',
        signed_document_id: '$receipt_document_id',
        created_at: '$created_at',
        updated_at: '$updated_at',
      },
    },
  ];
}

export const reportController = {
  requisitions: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      const { page, limit, skip } = readPagination(req.query as Record<string, unknown>, {
        defaultLimit: 100,
        maxLimit: 500,
      });
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
      const { page, limit, skip } = readPagination(req.query as Record<string, unknown>, {
        defaultLimit: 100,
        maxLimit: 500,
      });
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

      const requisitionPipeline = buildRequisitionNonCompliancePipeline(requisitionFilter);
      const returnRequestPipeline = buildReturnRequestNonCompliancePipeline(returnRequestFilter);
      const returnRequestCollection = ReturnRequestModel.collection.name;

      const aggregated = await RequisitionModel.aggregate([
        ...requisitionPipeline,
        {
          $unionWith: {
            coll: returnRequestCollection,
            pipeline: returnRequestPipeline,
          },
        },
        { $sort: { created_at: -1 } },
        {
          $facet: {
            items: [{ $skip: skip }, { $limit: limit }],
            total: [{ $count: 'count' }],
            requisitions: [{ $match: { type: 'REQUISITION' } }, { $count: 'count' }],
            returnRequests: [{ $match: { type: 'RETURN_REQUEST' } }, { $count: 'count' }],
          },
        },
      ]);

      const bucket = aggregated[0] || {
        items: [],
        total: [],
        requisitions: [],
        returnRequests: [],
      };
      const total = Number((bucket.total?.[0] as { count?: number } | undefined)?.count || 0);
      const requisitionCount = Number((bucket.requisitions?.[0] as { count?: number } | undefined)?.count || 0);
      const returnRequestCount = Number((bucket.returnRequests?.[0] as { count?: number } | undefined)?.count || 0);

      return res.json({
        page,
        limit,
        total,
        officeId,
        counts: {
          requisitionsWithoutSignedIssueSlip: requisitionCount,
          returnRequestsWithoutSignedReturnSlip: returnRequestCount,
          total,
        },
        items: bucket.items || [],
      });
    } catch (error) {
      return next(error);
    }
  },
};

