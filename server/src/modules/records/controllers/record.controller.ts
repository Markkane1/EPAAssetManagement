import { Response, NextFunction } from 'express';
import type { AuthRequest } from '../../../middleware/auth';
import { getRequestContext } from '../../../utils/scope';
import { createHttpError } from '../../../utils/httpError';
import { createRecord, getRecordById, listRecords, listRegister, updateRecordStatus } from '../services/record.service';
import { getRecordDetail } from '../services/recordDetail.service';

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export const recordController = {
  create: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      const record = await createRecord(ctx, {
        recordType: req.body.recordType,
        officeId: req.body.officeId,
        status: req.body.status,
        assetItemId: req.body.assetItemId,
        employeeId: req.body.employeeId,
        assignmentId: req.body.assignmentId,
        transferId: req.body.transferId,
        maintenanceRecordId: req.body.maintenanceRecordId,
        notes: req.body.notes,
      });
      res.status(201).json(record);
    } catch (error) {
      next(error);
    }
  },
  list: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      const filters: Record<string, unknown> = {};
      if (req.query.recordType) filters.record_type = req.query.recordType;
      if (req.query.status) filters.status = req.query.status;
      if (req.query.officeId) filters.office_id = req.query.officeId;
      if (req.query.assetItemId) filters.asset_item_id = req.query.assetItemId;
      if (req.query.employeeId) filters.employee_id = req.query.employeeId;
      if (req.query.assignmentId) filters.assignment_id = req.query.assignmentId;
      if (req.query.transferId) filters.transfer_id = req.query.transferId;
      if (req.query.maintenanceRecordId) filters.maintenance_record_id = req.query.maintenanceRecordId;
      if (req.query.referenceNo) filters.reference_no = req.query.referenceNo;
      if (req.query.from || req.query.to) {
        filters.created_at = {} as Record<string, unknown>;
        if (req.query.from) (filters.created_at as Record<string, unknown>).$gte = new Date(String(req.query.from));
        if (req.query.to) (filters.created_at as Record<string, unknown>).$lte = new Date(String(req.query.to));
      }
      const page = clampInt(req.query.page, 1, 1, 100000);
      const limit = clampInt(req.query.limit, 500, 1, 2000);

      const records = await listRecords(ctx, filters, { page, limit });
      res.json(records);
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      const record = await getRecordById(ctx, String(req.params.id));
      res.json(record);
    } catch (error) {
      next(error);
    }
  },
  detail: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      const detail = await getRecordDetail(ctx, String(req.params.id));
      res.json(detail);
    } catch (error) {
      next(error);
    }
  },
  updateStatus: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      if (!req.body.status) throw createHttpError(400, 'Status is required');
      const record = await updateRecordStatus(ctx, String(req.params.id), req.body.status, req.body.notes);
      res.json(record);
    } catch (error) {
      next(error);
    }
  },
  issueRegister: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      const page = clampInt(req.query.page, 1, 1, 100000);
      const limit = clampInt(req.query.limit, 500, 1, 2000);
      const records = await listRegister(
        ctx,
        'ISSUE',
        req.query.from as string | undefined,
        req.query.to as string | undefined,
        req.query.office as string | undefined,
        { page, limit }
      );
      res.json(records);
    } catch (error) {
      next(error);
    }
  },
  transferRegister: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      const page = clampInt(req.query.page, 1, 1, 100000);
      const limit = clampInt(req.query.limit, 500, 1, 2000);
      const records = await listRegister(
        ctx,
        'TRANSFER',
        req.query.from as string | undefined,
        req.query.to as string | undefined,
        req.query.office as string | undefined,
        { page, limit }
      );
      res.json(records);
    } catch (error) {
      next(error);
    }
  },
  maintenanceRegister: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      const page = clampInt(req.query.page, 1, 1, 100000);
      const limit = clampInt(req.query.limit, 500, 1, 2000);
      const records = await listRegister(
        ctx,
        'MAINTENANCE',
        req.query.from as string | undefined,
        req.query.to as string | undefined,
        req.query.office as string | undefined,
        { page, limit }
      );
      res.json(records);
    } catch (error) {
      next(error);
    }
  },
};
