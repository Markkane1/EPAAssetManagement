import { Response, NextFunction } from 'express';
import type { AuthRequest } from '../../../middleware/auth';
import { getRequestContext } from '../../../utils/scope';
import { createHttpError } from '../../../utils/httpError';
import { createRecord, getRecordById, listRecords, listRegister, updateRecordStatus } from '../services/record.service';

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
      if (req.query.from || req.query.to) {
        filters.created_at = {} as Record<string, unknown>;
        if (req.query.from) (filters.created_at as Record<string, unknown>).$gte = new Date(String(req.query.from));
        if (req.query.to) (filters.created_at as Record<string, unknown>).$lte = new Date(String(req.query.to));
      }

      const records = await listRecords(ctx, filters);
      res.json(records);
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      const record = await getRecordById(ctx, req.params.id);
      res.json(record);
    } catch (error) {
      next(error);
    }
  },
  updateStatus: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      if (!req.body.status) throw createHttpError(400, 'Status is required');
      const record = await updateRecordStatus(ctx, req.params.id, req.body.status, req.body.notes);
      res.json(record);
    } catch (error) {
      next(error);
    }
  },
  issueRegister: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      const records = await listRegister(
        ctx,
        'ISSUE',
        req.query.from as string | undefined,
        req.query.to as string | undefined,
        req.query.office as string | undefined
      );
      res.json(records);
    } catch (error) {
      next(error);
    }
  },
  transferRegister: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      const records = await listRegister(
        ctx,
        'TRANSFER',
        req.query.from as string | undefined,
        req.query.to as string | undefined,
        req.query.office as string | undefined
      );
      res.json(records);
    } catch (error) {
      next(error);
    }
  },
  maintenanceRegister: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      const records = await listRegister(
        ctx,
        'MAINTENANCE',
        req.query.from as string | undefined,
        req.query.to as string | undefined,
        req.query.office as string | undefined
      );
      res.json(records);
    } catch (error) {
      next(error);
    }
  },
};
