import { NextFunction, Response } from 'express';
import { type PipelineStage, Types } from 'mongoose';
import type { AuthRequest } from '../middleware/auth';
import { RequisitionModel } from '../models/requisition.model';
import { ReturnRequestModel } from '../models/returnRequest.model';
import { AssetItemModel } from '../models/assetItem.model';
import { AssetModel } from '../models/asset.model';
import { AssignmentModel } from '../models/assignment.model';
import { MaintenanceRecordModel } from '../models/maintenanceRecord.model';
import { TransferModel } from '../models/transfer.model';
import { ConsumableInventoryBalanceModel } from '../modules/consumables/models/consumableInventoryBalance.model';
import { ConsumableInventoryTransactionModel } from '../modules/consumables/models/consumableInventoryTransaction.model';
import { ConsumableLotModel } from '../modules/consumables/models/consumableLot.model';
import { RequisitionLineModel } from '../models/requisitionLine.model';
import { createHttpError } from '../utils/httpError';
import { getRequestContext } from '../utils/scope';
import { parseDateInput, readPagination } from '../utils/requestParsing';
import {
  isHolderInEmployeeScope,
  isHolderInOfficeScope,
  resolveEmployeeScopedHolderIds,
  resolveOfficeScopedHolderIds,
  type EmployeeScopedHolderIds,
  type OfficeScopedHolderIds,
} from '../modules/consumables/utils/accessScope';

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

function toObjectId(value: unknown): Types.ObjectId | null {
  const s = String(value ?? '').trim();
  return Types.ObjectId.isValid(s) ? new Types.ObjectId(s) : null;
}

function applyTxTimeRange(filter: Record<string, unknown>, from: Date | null, to: Date | null) {
  if (!from && !to) return;
  const range: Record<string, string> = {};
  if (from) range.$gte = from.toISOString();
  if (to) range.$lte = to.toISOString();
  filter.tx_time = range;
}

const REPORT_HOLDER_TYPES = new Set(['OFFICE', 'STORE', 'EMPLOYEE', 'SUB_LOCATION']);

function normalizeReportHolderType(value: unknown) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return null;
  if (!REPORT_HOLDER_TYPES.has(normalized)) {
    throw createHttpError(400, 'holderType is invalid');
  }
  return normalized as 'OFFICE' | 'STORE' | 'EMPLOYEE' | 'SUB_LOCATION';
}

function buildOfficeScopedLedgerFilter(scope: OfficeScopedHolderIds) {
  const filters: Record<string, unknown>[] = [
    { from_holder_type: 'OFFICE', from_holder_id: new Types.ObjectId(scope.officeId) },
    { to_holder_type: 'OFFICE', to_holder_id: new Types.ObjectId(scope.officeId) },
  ];
  if (scope.subLocationIds.length > 0) {
    filters.push({
      from_holder_type: 'SUB_LOCATION',
      from_holder_id: { $in: scope.subLocationIds.map((id) => new Types.ObjectId(id)) },
    });
    filters.push({
      to_holder_type: 'SUB_LOCATION',
      to_holder_id: { $in: scope.subLocationIds.map((id) => new Types.ObjectId(id)) },
    });
  }
  if (scope.employeeIds.length > 0) {
    filters.push({
      from_holder_type: 'EMPLOYEE',
      from_holder_id: { $in: scope.employeeIds.map((id) => new Types.ObjectId(id)) },
    });
    filters.push({
      to_holder_type: 'EMPLOYEE',
      to_holder_id: { $in: scope.employeeIds.map((id) => new Types.ObjectId(id)) },
    });
  }
  return { $or: filters };
}

function buildEmployeeScopedLedgerFilter(scope: EmployeeScopedHolderIds) {
  const filters: Record<string, unknown>[] = [
    { from_holder_type: 'EMPLOYEE', from_holder_id: new Types.ObjectId(scope.employeeId) },
    { to_holder_type: 'EMPLOYEE', to_holder_id: new Types.ObjectId(scope.employeeId) },
  ];
  if (scope.subLocationIds.length > 0) {
    filters.push({
      from_holder_type: 'SUB_LOCATION',
      from_holder_id: { $in: scope.subLocationIds.map((id) => new Types.ObjectId(id)) },
    });
    filters.push({
      to_holder_type: 'SUB_LOCATION',
      to_holder_id: { $in: scope.subLocationIds.map((id) => new Types.ObjectId(id)) },
    });
  }
  return { $or: filters };
}

function buildOfficeScopedBalanceMatch(scope: OfficeScopedHolderIds) {
  const filters: Record<string, unknown>[] = [
    { holder_type: 'OFFICE', holder_id: new Types.ObjectId(scope.officeId) },
  ];
  if (scope.subLocationIds.length > 0) {
    filters.push({
      holder_type: 'SUB_LOCATION',
      holder_id: { $in: scope.subLocationIds.map((id) => new Types.ObjectId(id)) },
    });
  }
  if (scope.employeeIds.length > 0) {
    filters.push({
      holder_type: 'EMPLOYEE',
      holder_id: { $in: scope.employeeIds.map((id) => new Types.ObjectId(id)) },
    });
  }
  return { $or: filters };
}

function buildEmployeeScopedBalanceMatch(scope: EmployeeScopedHolderIds) {
  const filters: Record<string, unknown>[] = [
    { holder_type: 'EMPLOYEE', holder_id: new Types.ObjectId(scope.employeeId) },
  ];
  if (scope.subLocationIds.length > 0) {
    filters.push({
      holder_type: 'SUB_LOCATION',
      holder_id: { $in: scope.subLocationIds.map((id) => new Types.ObjectId(id)) },
    });
  }
  return { $or: filters };
}

function withAnd(base: Record<string, unknown>, clause: Record<string, unknown> | null) {
  if (!clause || Object.keys(clause).length === 0) return base;
  if (Object.keys(base).length === 0) return clause;
  return { $and: [base, clause] };
}

function ensureOperationalReportAccess(ctx: { role: string }) {
  if (String(ctx.role || '').trim().toLowerCase() === 'employee') {
    throw createHttpError(403, 'Employees are not permitted to access operational reports');
  }
}

async function resolveScopedConsumableFilters(
  ctx: { userId: string; role: string; locationId: string | null; isOrgAdmin: boolean },
  params: { officeId?: unknown; holderType?: unknown; holderId?: unknown }
) {
  const officeId = resolveScopedOfficeId(ctx, params.officeId);
  const holderType = normalizeReportHolderType(params.holderType);
  const holderId = toObjectId(params.holderId);
  if ((holderType && !holderId) || (!holderType && holderId)) {
    throw createHttpError(400, 'holderType and holderId must be provided together');
  }

  if (ctx.isOrgAdmin) {
    const officeScope = officeId ? await resolveOfficeScopedHolderIds(officeId) : null;
    return {
      officeId,
      balanceScope: officeScope ? buildOfficeScopedBalanceMatch(officeScope) : null,
      ledgerScope: officeScope ? buildOfficeScopedLedgerFilter(officeScope) : null,
      explicitHolder:
        holderType && holderId
          ? { holderType, holderId }
          : null,
    };
  }

  if (ctx.role === 'employee') {
    const employeeScope = await resolveEmployeeScopedHolderIds(ctx.userId);
    if (holderType || holderId) {
      if (!holderType || !holderId) {
        throw createHttpError(400, 'holderType and holderId must be provided together');
      }
      if (!isHolderInEmployeeScope(holderType, String(holderId), employeeScope)) {
        throw createHttpError(403, 'User does not have access to this holder');
      }
    }
    return {
      officeId,
      balanceScope: buildEmployeeScopedBalanceMatch(employeeScope),
      ledgerScope: buildEmployeeScopedLedgerFilter(employeeScope),
      explicitHolder:
        holderType && holderId
          ? { holderType, holderId }
          : null,
    };
  }

  if (!ctx.locationId) {
    throw createHttpError(403, 'User is not assigned to an office');
  }
  const officeScope = await resolveOfficeScopedHolderIds(ctx.locationId);
  if (holderType || holderId) {
    if (!holderType || !holderId) {
      throw createHttpError(400, 'holderType and holderId must be provided together');
    }
    if (!isHolderInOfficeScope(holderType, String(holderId), officeScope)) {
      throw createHttpError(403, 'User does not have access to this holder');
    }
  }
  return {
    officeId: ctx.locationId,
    balanceScope: buildOfficeScopedBalanceMatch(officeScope),
    ledgerScope: buildOfficeScopedLedgerFilter(officeScope),
    explicitHolder:
      holderType && holderId
        ? { holderType, holderId }
        : null,
  };
}

export const reportController = {
  inventorySnapshot: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      ensureOperationalReportAccess(ctx);
      const query = req.query as Record<string, unknown>;
      const { page, limit, skip } = readPagination(query, { defaultLimit: 100, maxLimit: 500 });
      const from = parseDateInput(query.from, 'from');
      const to = parseDateInput(query.to, 'to');
      if (from && to && from.getTime() > to.getTime()) {
        throw createHttpError(400, 'from must be earlier than or equal to to');
      }

      const mode = String(query.mode || 'moveable').trim().toLowerCase();
      if (mode !== 'moveable' && mode !== 'consumable') {
        throw createHttpError(400, "mode must be 'moveable' or 'consumable'");
      }

      const officeId = resolveScopedOfficeId(ctx, query.officeId);
      const categoryIdObj = toObjectId(query.categoryId);

      if (mode === 'moveable') {
        const matchStage: Record<string, unknown> = { is_active: true };
        const holderType = normalizeReportHolderType(query.holderType);
        const holderIdObj = toObjectId(query.holderId);
        if ((holderType && !holderIdObj) || (!holderType && holderIdObj)) {
          throw createHttpError(400, 'holderType and holderId must be provided together');
        }
        if (ctx.isOrgAdmin) {
          if (holderType) matchStage.holder_type = holderType;
          const effectiveHolderId = holderIdObj ?? (officeId ? new Types.ObjectId(officeId) : null);
          if (effectiveHolderId) matchStage.holder_id = effectiveHolderId;
        } else {
          if (holderType && holderType !== 'OFFICE') {
            throw createHttpError(403, 'Access restricted to office-held moveable inventory');
          }
          if (holderIdObj && String(holderIdObj) !== officeId) {
            throw createHttpError(403, 'Access restricted to assigned office');
          }
          if (!officeId) {
            throw createHttpError(403, 'User is not assigned to an office');
          }
          matchStage.holder_type = 'OFFICE';
          matchStage.holder_id = new Types.ObjectId(officeId);
        }
        if (from || to) {
          const range: Record<string, Date> = {};
          if (from) range.$gte = from;
          if (to) range.$lte = to;
          matchStage.created_at = range;
        }

        const pipeline: PipelineStage[] = [
          { $match: matchStage },
          {
            $lookup: {
              from: AssetModel.collection.name,
              localField: 'asset_id',
              foreignField: '_id',
              as: 'asset',
            },
          },
          { $unwind: { path: '$asset', preserveNullAndEmptyArrays: false } },
          ...(categoryIdObj ? [{ $match: { 'asset.category_id': categoryIdObj } }] : []),
          {
            $group: {
              _id: { category_id: '$asset.category_id', holder_type: '$holder_type', holder_id: '$holder_id' },
              count: { $sum: 1 },
              items: { $push: { _id: '$_id', asset_id: '$asset_id', serial_number: '$serial_number', tag: '$tag', assignment_status: '$assignment_status', item_status: '$item_status' } },
            },
          },
          { $sort: { '_id.category_id': 1, '_id.holder_type': 1 } },
          {
            $facet: {
              data: [{ $skip: skip }, { $limit: limit }],
              total: [{ $count: 'count' }],
            },
          },
        ];

        const [result] = await AssetItemModel.aggregate(pipeline);
        const total = Number(result?.total?.[0]?.count || 0);
        return res.json({ page, limit, total, mode, officeId, items: result?.data || [] });
      }

      // mode === 'consumable'
      const holderFilters = await resolveScopedConsumableFilters(ctx, {
        officeId: query.officeId,
        holderType: query.holderType,
        holderId: query.holderId,
      });
      let balanceMatch: Record<string, unknown> = {};
      if (holderFilters.balanceScope) {
        balanceMatch = withAnd(balanceMatch, holderFilters.balanceScope);
      }
      if (holderFilters.explicitHolder) {
        balanceMatch = withAnd(balanceMatch, {
          holder_type: holderFilters.explicitHolder.holderType,
          holder_id: holderFilters.explicitHolder.holderId,
        });
      }

      const consumablePipeline: PipelineStage[] = [
        { $match: balanceMatch },
        {
          $lookup: {
            from: 'consumableitems',
            localField: 'consumable_item_id',
            foreignField: '_id',
            as: 'item',
          },
        },
        { $unwind: { path: '$item', preserveNullAndEmptyArrays: false } },
        ...(categoryIdObj ? [{ $match: { 'item.category_id': categoryIdObj } }] : []),
        {
          $group: {
            _id: { category_id: '$item.category_id', holder_type: '$holder_type', holder_id: '$holder_id', consumable_item_id: '$consumable_item_id' },
            qty_on_hand_base: { $sum: '$qty_on_hand_base' },
            item_name: { $first: '$item.name' },
          },
        },
        { $sort: { '_id.category_id': 1, '_id.consumable_item_id': 1 } },
        {
          $facet: {
            data: [{ $skip: skip }, { $limit: limit }],
            total: [{ $count: 'count' }],
          },
        },
      ];

      const [cResult] = await ConsumableInventoryBalanceModel.aggregate(consumablePipeline);
      const cTotal = Number(cResult?.total?.[0]?.count || 0);
      return res.json({ page, limit, total: cTotal, mode, officeId: holderFilters.officeId, items: cResult?.data || [] });
    } catch (error) {
      return next(error);
    }
  },

  moveableAssigned: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      ensureOperationalReportAccess(ctx);
      const query = req.query as Record<string, unknown>;
      const { page, limit, skip } = readPagination(query, { defaultLimit: 100, maxLimit: 500 });
      const from = parseDateInput(query.from, 'from');
      const to = parseDateInput(query.to, 'to');
      if (from && to && from.getTime() > to.getTime()) {
        throw createHttpError(400, 'from must be earlier than or equal to to');
      }

      const officeId = resolveScopedOfficeId(ctx, query.officeId);
      const holderType = normalizeReportHolderType(query.holderType);
      const holderIdObj = toObjectId(query.holderId);
      if ((holderType && !holderIdObj) || (!holderType && holderIdObj)) {
        throw createHttpError(400, 'holderType and holderId must be provided together');
      }
      const categoryIdObj = toObjectId(query.categoryId);

      const assetItemMatch: Record<string, unknown> = { is_active: true };
      if (ctx.isOrgAdmin) {
        if (holderType) assetItemMatch.holder_type = holderType;
        const effectiveHolderId = holderIdObj ?? (officeId ? new Types.ObjectId(officeId) : null);
        if (effectiveHolderId) assetItemMatch.holder_id = effectiveHolderId;
      } else {
        if (holderType && holderType !== 'OFFICE') {
          throw createHttpError(403, 'Access restricted to office-held moveable inventory');
        }
        if (holderIdObj && String(holderIdObj) !== officeId) {
          throw createHttpError(403, 'Access restricted to assigned office');
        }
        if (!officeId) {
          throw createHttpError(403, 'User is not assigned to an office');
        }
        assetItemMatch.holder_type = 'OFFICE';
        assetItemMatch.holder_id = new Types.ObjectId(officeId);
      }

      const assignmentMatch: Record<string, unknown> = {};
      if (from || to) {
        const range: Record<string, Date> = {};
        if (from) range.$gte = from;
        if (to) range.$lte = to;
        assignmentMatch.assigned_date = range;
      }

      const pipeline: PipelineStage[] = [
        { $match: assetItemMatch },
        {
          $lookup: {
            from: AssetModel.collection.name,
            localField: 'asset_id',
            foreignField: '_id',
            as: 'asset',
          },
        },
        { $unwind: { path: '$asset', preserveNullAndEmptyArrays: false } },
        ...(categoryIdObj ? [{ $match: { 'asset.category_id': categoryIdObj } }] : []),
        {
          $lookup: {
            from: AssignmentModel.collection.name,
            let: { itemId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$asset_item_id', '$$itemId'] },
                  is_active: true,
                  ...assignmentMatch,
                },
              },
              { $sort: { assigned_date: -1 } },
              { $limit: 1 },
            ],
            as: 'active_assignment',
          },
        },
        { $unwind: { path: '$active_assignment', preserveNullAndEmptyArrays: false } },
        {
          $project: {
            asset_id: 1,
            serial_number: 1,
            tag: 1,
            holder_type: 1,
            holder_id: 1,
            assignment_status: 1,
            item_status: 1,
            asset_name: '$asset.name',
            category_id: '$asset.category_id',
            assigned_to_type: '$active_assignment.assigned_to_type',
            assigned_to_id: '$active_assignment.assigned_to_id',
            assigned_date: '$active_assignment.assigned_date',
            assignment_id: '$active_assignment._id',
            assignment_workflow_status: '$active_assignment.status',
          },
        },
        { $sort: { assigned_date: -1 } },
        {
          $facet: {
            items: [{ $skip: skip }, { $limit: limit }],
            total: [{ $count: 'count' }],
          },
        },
      ];

      const [result] = await AssetItemModel.aggregate(pipeline);
      const total = Number(result?.total?.[0]?.count || 0);
      return res.json({ page, limit, total, officeId, items: result?.items || [] });
    } catch (error) {
      return next(error);
    }
  },

  consumableAssigned: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      ensureOperationalReportAccess(ctx);
      const query = req.query as Record<string, unknown>;
      const { page, limit, skip } = readPagination(query, { defaultLimit: 100, maxLimit: 500 });

      const holderFilters = await resolveScopedConsumableFilters(ctx, {
        officeId: query.officeId,
        holderType: query.holderType,
        holderId: query.holderId,
      });
      const categoryIdObj = toObjectId(query.categoryId);
      const itemIdObj = toObjectId(query.itemId);

      let matchStage: Record<string, unknown> = {};
      if (holderFilters.balanceScope) {
        matchStage = withAnd(matchStage, holderFilters.balanceScope);
      }
      if (holderFilters.explicitHolder) {
        matchStage = withAnd(matchStage, {
          holder_type: holderFilters.explicitHolder.holderType,
          holder_id: holderFilters.explicitHolder.holderId,
        });
      }
      if (itemIdObj) matchStage.consumable_item_id = itemIdObj;

      const pipeline: PipelineStage[] = [
        { $match: matchStage },
        {
          $lookup: {
            from: 'consumableitems',
            localField: 'consumable_item_id',
            foreignField: '_id',
            as: 'item',
          },
        },
        { $unwind: { path: '$item', preserveNullAndEmptyArrays: false } },
        ...(categoryIdObj ? [{ $match: { 'item.category_id': categoryIdObj } }] : []),
        {
          $project: {
            holder_type: 1,
            holder_id: 1,
            consumable_item_id: 1,
            lot_id: 1,
            qty_on_hand_base: 1,
            qty_reserved_base: 1,
            item_name: '$item.name',
            base_uom: '$item.base_uom',
            category_id: '$item.category_id',
            is_controlled: '$item.is_controlled',
          },
        },
        { $sort: { holder_id: 1, consumable_item_id: 1 } },
        {
          $facet: {
            items: [{ $skip: skip }, { $limit: limit }],
            total: [{ $count: 'count' }],
          },
        },
      ];

      const [result] = await ConsumableInventoryBalanceModel.aggregate(pipeline);
      const total = Number(result?.total?.[0]?.count || 0);
      return res.json({ page, limit, total, officeId: holderFilters.officeId, items: result?.items || [] });
    } catch (error) {
      return next(error);
    }
  },

  consumableConsumed: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      ensureOperationalReportAccess(ctx);
      const query = req.query as Record<string, unknown>;
      const { page, limit, skip } = readPagination(query, { defaultLimit: 100, maxLimit: 500 });
      const from = parseDateInput(query.from, 'from');
      const to = parseDateInput(query.to, 'to');
      if (from && to && from.getTime() > to.getTime()) {
        throw createHttpError(400, 'from must be earlier than or equal to to');
      }

      const officeId = resolveScopedOfficeId(ctx, query.officeId);
      const mode = String(query.mode || 'office').trim().toLowerCase();
      if (mode !== 'office' && mode !== 'central') {
        throw createHttpError(400, "mode must be 'office' or 'central'");
      }
      if (!ctx.isOrgAdmin && mode === 'central') {
        throw createHttpError(403, 'Central store consumption reports are restricted to org admins');
      }
      const categoryIdObj = toObjectId(query.categoryId);
      const itemIdObj = toObjectId(query.itemId);

      const matchStage: Record<string, unknown> = { tx_type: 'CONSUME' };
      if (mode === 'office') {
        if (officeId) {
          const officeScope = await resolveOfficeScopedHolderIds(officeId);
          matchStage.$or = buildOfficeScopedLedgerFilter(officeScope).$or;
        }
      } else {
        matchStage.from_holder_type = 'STORE';
      }
      if (itemIdObj) matchStage.consumable_item_id = itemIdObj;
      applyTxTimeRange(matchStage, from, to);

      const pipeline: PipelineStage[] = [
        { $match: matchStage },
        {
          $lookup: {
            from: 'consumableitems',
            localField: 'consumable_item_id',
            foreignField: '_id',
            as: 'item',
          },
        },
        { $unwind: { path: '$item', preserveNullAndEmptyArrays: false } },
        ...(categoryIdObj ? [{ $match: { 'item.category_id': categoryIdObj } }] : []),
        {
          $project: {
            tx_type: 1,
            tx_time: 1,
            from_holder_type: 1,
            from_holder_id: 1,
            consumable_item_id: 1,
            lot_id: 1,
            qty_base: 1,
            entered_qty: 1,
            entered_uom: 1,
            reference: 1,
            notes: 1,
            item_name: '$item.name',
            base_uom: '$item.base_uom',
            category_id: '$item.category_id',
            created_at: 1,
          },
        },
        { $sort: { tx_time: -1 } },
        {
          $facet: {
            items: [{ $skip: skip }, { $limit: limit }],
            total: [{ $count: 'count' }],
            totalQty: [{ $group: { _id: null, sum: { $sum: '$qty_base' } } }],
          },
        },
      ];

      const [result] = await ConsumableInventoryTransactionModel.aggregate(pipeline);
      const total = Number(result?.total?.[0]?.count || 0);
      const totalQtyBase = Number(result?.totalQty?.[0]?.sum || 0);
      return res.json({ page, limit, total, totalQtyBase, officeId, mode, items: result?.items || [] });
    } catch (error) {
      return next(error);
    }
  },

  moveableLifecycle: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      ensureOperationalReportAccess(ctx);
      const assetItemId = String(req.params?.assetItemId || '').trim();
      if (!Types.ObjectId.isValid(assetItemId)) {
        throw createHttpError(400, 'assetItemId is invalid');
      }
      const assetItemObjId = new Types.ObjectId(assetItemId);

      const assetItem: any = await AssetItemModel.findById(assetItemObjId).lean();
      if (!assetItem) return res.status(404).json({ message: 'Asset item not found' });

      // Office scope: non-org-admins may only view items held by their office
      if (!ctx.isOrgAdmin) {
        if (!ctx.locationId) throw createHttpError(403, 'User is not assigned to an office');
        const holderIsOffice = String(assetItem.holder_type || '') === 'OFFICE';
        if (!holderIsOffice || String(assetItem.holder_id || '') !== ctx.locationId) {
          throw createHttpError(403, 'Access restricted to assigned office');
        }
      }

      const [asset, assignments, transfers, maintenanceRecords] = await Promise.all([
        AssetModel.findById(assetItem.asset_id, { name: 1, category_id: 1, description: 1 }).lean(),
        AssignmentModel.find({ asset_item_id: assetItemObjId }).sort({ assigned_date: 1 }).lean(),
        TransferModel.find({ 'lines.asset_item_id': assetItemObjId }).sort({ transfer_date: 1 }).lean(),
        MaintenanceRecordModel.find({ asset_item_id: assetItemObjId }).sort({ created_at: 1 }).lean(),
      ]);

      const timeline = [
        ...assignments.map((a: any) => ({
          event_type: 'ASSIGNMENT',
          event_date: a.assigned_date || a.created_at,
          status: a.status,
          assigned_to_type: a.assigned_to_type,
          assigned_to_id: a.assigned_to_id,
          returned_date: a.returned_date,
          _id: a._id,
        })),
        ...transfers.map((t: any) => ({
          event_type: 'TRANSFER',
          event_date: t.transfer_date || t.created_at,
          status: t.status,
          from_office_id: t.from_office_id,
          to_office_id: t.to_office_id,
          _id: t._id,
        })),
        ...maintenanceRecords.map((m: any) => ({
          event_type: 'MAINTENANCE',
          event_date: m.scheduled_date || m.created_at,
          maintenance_type: m.maintenance_type,
          maintenance_status: m.maintenance_status,
          completed_date: m.completed_date,
          notes: m.notes,
          _id: m._id,
        })),
      ].sort((a, b) => {
        const aTime = a.event_date ? new Date(a.event_date).getTime() : 0;
        const bTime = b.event_date ? new Date(b.event_date).getTime() : 0;
        return aTime - bTime;
      });

      return res.json({
        assetItemId,
        assetItem,
        asset,
        timeline,
        counts: {
          assignments: assignments.length,
          transfers: transfers.length,
          maintenanceRecords: maintenanceRecords.length,
        },
      });
    } catch (error) {
      return next(error);
    }
  },

  requisitions: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      ensureOperationalReportAccess(ctx);
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
      const officeObjectId = officeId ? new Types.ObjectId(officeId) : null;
      const filter: Record<string, unknown> = {};
      if (officeObjectId) filter.office_id = officeObjectId;
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
      ensureOperationalReportAccess(ctx);
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
      const officeObjectId = officeId ? new Types.ObjectId(officeId) : null;

      const requisitionFilter: Record<string, unknown> = {
        status: { $in: ['FULFILLED', 'FULFILLED_PENDING_SIGNATURE'] },
      };
      const returnRequestFilter: Record<string, unknown> = {
        status: { $in: ['CLOSED', 'CLOSED_PENDING_SIGNATURE'] },
      };
      if (officeObjectId) {
        requisitionFilter.office_id = officeObjectId;
        returnRequestFilter.office_id = officeObjectId;
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

  lotLifecycle: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      ensureOperationalReportAccess(ctx);
      const lotId = String(req.params?.lotId || '').trim();
      if (!Types.ObjectId.isValid(lotId)) {
        throw createHttpError(400, 'lotId is invalid');
      }
      const lotObjId = new Types.ObjectId(lotId);

      const lot: any = await ConsumableLotModel.findById(lotObjId).lean();
      if (!lot) return res.status(404).json({ message: 'Lot not found' });

      if (!ctx.isOrgAdmin) {
        if (!ctx.locationId) throw createHttpError(403, 'User is not assigned to an office');
        const lotHolder = String(lot.holder_id || '');
        if (lotHolder !== ctx.locationId) {
          throw createHttpError(403, 'Access restricted to assigned office');
        }
      }

      const transactions = await ConsumableInventoryTransactionModel.find(
        { lot_id: lotObjId },
        { tx_type: 1, tx_time: 1, from_holder_type: 1, from_holder_id: 1, to_holder_type: 1, to_holder_id: 1, qty_base: 1, entered_qty: 1, entered_uom: 1, reference: 1, notes: 1, created_at: 1 }
      ).sort({ tx_time: 1 }).lean();

      return res.json({
        lotId,
        lot,
        transactions,
        counts: { transactions: transactions.length },
      });
    } catch (error) {
      return next(error);
    }
  },

  assignmentTrace: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      ensureOperationalReportAccess(ctx);
      const assignmentId = String(req.params?.assignmentId || '').trim();
      if (!Types.ObjectId.isValid(assignmentId)) {
        throw createHttpError(400, 'assignmentId is invalid');
      }
      const assignmentObjId = new Types.ObjectId(assignmentId);

      const assignment: any = await AssignmentModel.findById(assignmentObjId).lean();
      if (!assignment) return res.status(404).json({ message: 'Assignment not found' });

      const [requisition, requisitionLine, assetItem, returnRequest] = await Promise.all([
        RequisitionModel.findById(assignment.requisition_id, {
          file_number: 1, status: 1, office_id: 1, issuing_office_id: 1, created_at: 1, updated_at: 1,
        }).lean() as Promise<any>,
        RequisitionLineModel.findById(assignment.requisition_line_id, {
          line_type: 1, requested_name: 1, mapped_name: 1, requested_quantity: 1, approved_quantity: 1, fulfilled_quantity: 1, status: 1,
        }).lean(),
        AssetItemModel.findById(assignment.asset_item_id, {
          serial_number: 1, tag: 1, asset_id: 1, holder_type: 1, holder_id: 1, assignment_status: 1, item_status: 1,
        }).lean(),
        ReturnRequestModel.findOne(
          { 'lines.assignment_id': assignmentObjId },
          { status: 1, office_id: 1, receipt_document_id: 1, created_at: 1, updated_at: 1 }
        ).lean(),
      ]);

      if (!ctx.isOrgAdmin) {
        if (!ctx.locationId) throw createHttpError(403, 'User is not assigned to an office');
        const reqOfficeId = String((requisition as any)?.office_id || '');
        if (reqOfficeId !== ctx.locationId) {
          throw createHttpError(403, 'Access restricted to assigned office');
        }
      }

      return res.json({
        assignmentId,
        assignment,
        requisition,
        requisitionLine,
        assetItem,
        returnRequest: returnRequest ?? null,
      });
    } catch (error) {
      return next(error);
    }
  },

  requisitionAging: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      ensureOperationalReportAccess(ctx);
      const query = req.query as Record<string, unknown>;
      const { page, limit, skip } = readPagination(query, { defaultLimit: 100, maxLimit: 500 });
      const from = parseDateInput(query.from, 'from');
      const to = parseDateInput(query.to, 'to');
      if (from && to && from.getTime() > to.getTime()) {
        throw createHttpError(400, 'from must be earlier than or equal to to');
      }

      const officeId = resolveScopedOfficeId(ctx, query.officeId);
      const statusRaw = String(query.status || '').trim() || null;

      const filter: Record<string, unknown> = {};
      if (officeId) filter.office_id = new Types.ObjectId(officeId);
      if (statusRaw) filter.status = statusRaw;
      applyCreatedAtRange(filter, from, to);

      const nowMs = Date.now();
      const pipeline: PipelineStage[] = [
        { $match: filter },
        {
          $addFields: {
            age_days: {
              $divide: [{ $subtract: [nowMs, '$created_at'] }, 86_400_000],
            },
            age_bucket: {
              $switch: {
                branches: [
                  { case: { $lte: [{ $subtract: [nowMs, '$created_at'] }, 3 * 86_400_000] }, then: '0-3d' },
                  { case: { $lte: [{ $subtract: [nowMs, '$created_at'] }, 7 * 86_400_000] }, then: '4-7d' },
                  { case: { $lte: [{ $subtract: [nowMs, '$created_at'] }, 14 * 86_400_000] }, then: '8-14d' },
                  { case: { $lte: [{ $subtract: [nowMs, '$created_at'] }, 30 * 86_400_000] }, then: '15-30d' },
                ],
                default: '>30d',
              },
            },
          },
        },
        { $sort: { created_at: 1 } },
        {
          $facet: {
            items: [
              { $skip: skip },
              { $limit: limit },
              {
                $project: {
                  file_number: 1, status: 1, office_id: 1, issuing_office_id: 1,
                  created_at: 1, updated_at: 1, age_days: 1, age_bucket: 1,
                },
              },
            ],
            total: [{ $count: 'count' }],
            buckets: [{ $group: { _id: '$age_bucket', count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
          },
        },
      ];

      const [result] = await RequisitionModel.aggregate(pipeline);
      const total = Number(result?.total?.[0]?.count || 0);
      return res.json({
        page, limit, total, officeId,
        buckets: (result?.buckets || []).map((b: { _id: string; count: number }) => ({ bucket: b._id, count: b.count })),
        items: result?.items || [],
      });
    } catch (error) {
      return next(error);
    }
  },

  returnAging: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      ensureOperationalReportAccess(ctx);
      const query = req.query as Record<string, unknown>;
      const { page, limit, skip } = readPagination(query, { defaultLimit: 100, maxLimit: 500 });
      const from = parseDateInput(query.from, 'from');
      const to = parseDateInput(query.to, 'to');
      if (from && to && from.getTime() > to.getTime()) {
        throw createHttpError(400, 'from must be earlier than or equal to to');
      }

      const officeId = resolveScopedOfficeId(ctx, query.officeId);
      const statusRaw = String(query.status || '').trim() || null;

      const filter: Record<string, unknown> = {};
      if (officeId) filter.office_id = new Types.ObjectId(officeId);
      if (statusRaw) filter.status = statusRaw;
      applyCreatedAtRange(filter, from, to);

      const nowMs = Date.now();
      const pipeline: PipelineStage[] = [
        { $match: filter },
        {
          $addFields: {
            age_days: {
              $divide: [{ $subtract: [nowMs, '$created_at'] }, 86_400_000],
            },
            age_bucket: {
              $switch: {
                branches: [
                  { case: { $lte: [{ $subtract: [nowMs, '$created_at'] }, 3 * 86_400_000] }, then: '0-3d' },
                  { case: { $lte: [{ $subtract: [nowMs, '$created_at'] }, 7 * 86_400_000] }, then: '4-7d' },
                  { case: { $lte: [{ $subtract: [nowMs, '$created_at'] }, 14 * 86_400_000] }, then: '8-14d' },
                  { case: { $lte: [{ $subtract: [nowMs, '$created_at'] }, 30 * 86_400_000] }, then: '15-30d' },
                ],
                default: '>30d',
              },
            },
          },
        },
        { $sort: { created_at: 1 } },
        {
          $facet: {
            items: [
              { $skip: skip },
              { $limit: limit },
              {
                $project: {
                  status: 1, office_id: 1, employee_id: 1, asset_item_id: 1,
                  receipt_document_id: 1, created_at: 1, updated_at: 1, age_days: 1, age_bucket: 1,
                },
              },
            ],
            total: [{ $count: 'count' }],
            buckets: [{ $group: { _id: '$age_bucket', count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
          },
        },
      ];

      const [result] = await ReturnRequestModel.aggregate(pipeline);
      const total = Number(result?.total?.[0]?.count || 0);
      return res.json({
        page, limit, total, officeId,
        buckets: (result?.buckets || []).map((b: { _id: string; count: number }) => ({ bucket: b._id, count: b.count })),
        items: result?.items || [],
      });
    } catch (error) {
      return next(error);
    }
  },

  analyticsTrends: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      ensureOperationalReportAccess(ctx);
      const query = req.query as Record<string, unknown>;
      const from = parseDateInput(query.from, 'from');
      const to = parseDateInput(query.to, 'to');
      if (!from || !to) throw createHttpError(400, 'from and to are required');
      if (from.getTime() > to.getTime()) {
        throw createHttpError(400, 'from must be earlier than or equal to to');
      }

      const officeId = resolveScopedOfficeId(ctx, query.officeId);
      const categoryIdObj = toObjectId(query.categoryId);
      const itemIdObj = toObjectId(query.itemId);

      const granularityRaw = String(query.granularity || 'day').trim().toLowerCase();
      const granularity = (['day', 'week', 'month'] as const).includes(granularityRaw as 'day' | 'week' | 'month')
        ? (granularityRaw as 'day' | 'week' | 'month')
        : 'day';

      const matchStage: Record<string, unknown> = {
        tx_time: { $gte: from.toISOString(), $lte: to.toISOString() },
        tx_type: { $in: ['CONSUME', 'TRANSFER', 'RECEIPT'] },
      };
      if (officeId) {
        const officeScope = await resolveOfficeScopedHolderIds(officeId);
        matchStage.$or = buildOfficeScopedLedgerFilter(officeScope).$or;
      }
      if (itemIdObj) matchStage.consumable_item_id = itemIdObj;

      const pipeline: PipelineStage[] = [
        { $match: matchStage },
        ...(categoryIdObj
          ? [
              {
                $lookup: {
                  from: 'consumableitems',
                  localField: 'consumable_item_id',
                  foreignField: '_id',
                  as: 'item',
                },
              } as PipelineStage,
              { $unwind: { path: '$item', preserveNullAndEmptyArrays: false } } as PipelineStage,
              { $match: { 'item.category_id': categoryIdObj } } as PipelineStage,
            ]
          : []),
        {
          $addFields: {
            date_bucket: {
              $dateToString: {
                format: granularity === 'month' ? '%Y-%m' : granularity === 'week' ? '%G-W%V' : '%Y-%m-%d',
                date: { $dateFromString: { dateString: '$tx_time' } },
              },
            },
          },
        },
        {
          $group: {
            _id: { date_bucket: '$date_bucket', tx_type: '$tx_type', consumable_item_id: '$consumable_item_id' },
            qty_base: { $sum: '$qty_base' },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.date_bucket': 1, '_id.tx_type': 1 } },
        {
          $group: {
            _id: '$_id.date_bucket',
            series: {
              $push: {
                tx_type: '$_id.tx_type',
                consumable_item_id: '$_id.consumable_item_id',
                qty_base: '$qty_base',
                count: '$count',
              },
            },
          },
        },
        { $sort: { _id: 1 } },
      ];

      const rows = await ConsumableInventoryTransactionModel.aggregate(pipeline);
      return res.json({ from: from.toISOString(), to: to.toISOString(), granularity, officeId, data: rows });
    } catch (error) {
      return next(error);
    }
  },
};
