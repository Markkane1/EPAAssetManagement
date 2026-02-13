import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { AssignmentModel } from '../models/assignment.model';
import { AssetItemModel } from '../models/assetItem.model';
import { EmployeeModel } from '../models/employee.model';
import { mapFields } from '../utils/mapFields';
import type { AuthRequest } from '../middleware/auth';
import { resolveAccessContext, ensureOfficeScope, isOfficeManager } from '../utils/accessControl';
import { createHttpError } from '../utils/httpError';
import { createRecord } from '../modules/records/services/record.service';
import { logAudit } from '../modules/records/services/audit.service';

const fieldMap = {
  assetItemId: 'asset_item_id',
  employeeId: 'employee_id',
  assignedDate: 'assigned_date',
  expectedReturnDate: 'expected_return_date',
  returnedDate: 'returned_date',
  isActive: 'is_active',
};

function clampInt(value: unknown, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.floor(parsed), max));
}

function buildPayload(body: Record<string, unknown>) {
  const payload = mapFields(body, fieldMap);
  Object.values(fieldMap).forEach((dbKey) => {
    if (body[dbKey] !== undefined) {
      payload[dbKey] = body[dbKey];
    }
  });
  if (body.notes !== undefined) payload.notes = body.notes;
  if (payload.assigned_date) payload.assigned_date = new Date(String(payload.assigned_date));
  if (payload.expected_return_date) payload.expected_return_date = new Date(String(payload.expected_return_date));
  if (payload.returned_date) payload.returned_date = new Date(String(payload.returned_date));
  return payload;
}

export const assignmentController = {
  list: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const limit = clampInt(req.query.limit, 200, 1000);
      const page = clampInt(req.query.page, 1, 10_000);
      const skip = (page - 1) * limit;
      const access = await resolveAccessContext(req.user);
      if (access.isHeadofficeAdmin) {
        const assignments = await AssignmentModel.find()
          .sort({ assigned_date: -1 })
          .skip(skip)
          .limit(limit);
        return res.json(assignments);
      }
      if (!access.officeId) throw createHttpError(403, 'User is not assigned to an office');
      const assetItemIds = await AssetItemModel.distinct('_id', {
        location_id: access.officeId,
        is_active: true,
      });
      const assignments = await AssignmentModel.find({
        asset_item_id: { $in: assetItemIds },
      })
        .sort({ assigned_date: -1 })
        .skip(skip)
        .limit(limit);
      res.json(assignments);
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const assignment = await AssignmentModel.findById(req.params.id);
      if (!assignment) return res.status(404).json({ message: 'Not found' });
      if (!assignment.is_active) {
        throw createHttpError(400, 'Assignment is already closed');
      }
      const access = await resolveAccessContext(req.user);
      if (!access.isHeadofficeAdmin) {
        const item = await AssetItemModel.findById(assignment.asset_item_id);
        if (!item?.location_id) throw createHttpError(403, 'Access restricted to assigned office');
        ensureOfficeScope(access, item.location_id.toString());
      }
      return res.json(assignment);
    } catch (error) {
      next(error);
    }
  },
  getByEmployee: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const limit = clampInt(req.query.limit, 200, 1000);
      const page = clampInt(req.query.page, 1, 10_000);
      const access = await resolveAccessContext(req.user);
      if (!access.isHeadofficeAdmin) {
        if (!access.officeId) throw createHttpError(403, 'User is not assigned to an office');
        const employee = await EmployeeModel.findById(req.params.employeeId);
        if (!employee?.location_id) throw createHttpError(403, 'Employee is not assigned to an office');
        ensureOfficeScope(access, employee.location_id.toString());
      }
      const assignments = await AssignmentModel.find({
        employee_id: req.params.employeeId,
      })
        .sort({ assigned_date: -1 })
        .skip((page - 1) * limit)
        .limit(limit);
      res.json(assignments);
    } catch (error) {
      next(error);
    }
  },
  getByAssetItem: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const limit = clampInt(req.query.limit, 200, 1000);
      const page = clampInt(req.query.page, 1, 10_000);
      const access = await resolveAccessContext(req.user);
      if (!access.isHeadofficeAdmin) {
        const item = await AssetItemModel.findById(req.params.assetItemId);
        if (!item?.location_id) throw createHttpError(403, 'Access restricted to assigned office');
        ensureOfficeScope(access, item.location_id.toString());
      }
      const assignments = await AssignmentModel.find({
        asset_item_id: req.params.assetItemId,
      })
        .sort({ assigned_date: -1 })
        .skip((page - 1) * limit)
        .limit(limit);
      res.json(assignments);
    } catch (error) {
      next(error);
    }
  },
  create: async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    try {
      const access = await resolveAccessContext(req.user);
      if (!access.isHeadofficeAdmin && !isOfficeManager(access.role)) {
        throw createHttpError(403, 'Not permitted to assign assets');
      }

      const payload = buildPayload(req.body);
      if (payload.is_active === undefined) payload.is_active = true;
      if (!payload.asset_item_id || !payload.employee_id || !payload.assigned_date) {
        throw createHttpError(400, 'Asset item, employee, and assigned date are required');
      }

      const assetItem = await AssetItemModel.findById(payload.asset_item_id);
      if (!assetItem) throw createHttpError(404, 'Asset item not found');
      if (assetItem.is_active === false) {
        throw createHttpError(400, 'Cannot assign an inactive asset item');
      }
      if (!access.isHeadofficeAdmin && assetItem.location_id) {
        ensureOfficeScope(access, assetItem.location_id.toString());
      }
      if (assetItem.assignment_status === 'Assigned') {
        throw createHttpError(400, 'Asset item already has an active assignment');
      }

      const employee = await EmployeeModel.findById(payload.employee_id);
      if (!employee) throw createHttpError(404, 'Employee not found');
      if (!access.isHeadofficeAdmin && employee.location_id) {
        ensureOfficeScope(access, employee.location_id.toString());
      }

      await session.withTransaction(async () => {
        const existing = await AssignmentModel.findOne({
          asset_item_id: payload.asset_item_id,
          is_active: true,
        }).session(session);
        if (existing) throw createHttpError(400, 'Asset item already has an active assignment');

        const assignment = await AssignmentModel.create([payload], { session });
        await AssetItemModel.findByIdAndUpdate(
          payload.asset_item_id,
          { assignment_status: 'Assigned', item_status: 'Assigned' },
          { session }
        );

        await createRecord(
          {
            userId: access.userId,
            role: access.role,
            locationId: access.officeId,
            isHeadoffice: access.isHeadofficeAdmin,
          },
          {
            recordType: 'ISSUE',
            officeId: assetItem.location_id?.toString(),
            status: 'Completed',
            assetItemId: payload.asset_item_id as string,
            employeeId: payload.employee_id as string,
            assignmentId: assignment[0].id,
            notes: payload.notes as string | undefined,
          },
          session
        );

        await logAudit({
          ctx: {
            userId: access.userId,
            role: access.role,
            locationId: access.officeId,
            isHeadoffice: access.isHeadofficeAdmin,
          },
          action: 'ASSIGN_CREATE',
          entityType: 'Assignment',
          entityId: assignment[0].id,
          officeId: assetItem.location_id?.toString() || access.officeId || '',
          diff: { assetItemId: payload.asset_item_id, employeeId: payload.employee_id },
          session,
        });

        res.status(201).json(assignment[0]);
      });
    } catch (error) {
      next(error);
    } finally {
      session.endSession();
    }
  },
  update: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      if (!access.isHeadofficeAdmin && !isOfficeManager(access.role)) {
        throw createHttpError(403, 'Not permitted to update assignments');
      }
      const payload = buildPayload(req.body);
      const assignment = await AssignmentModel.findByIdAndUpdate(req.params.id, payload, { new: true });
      if (!assignment) return res.status(404).json({ message: 'Not found' });
      return res.json(assignment);
    } catch (error) {
      next(error);
    }
  },
  returnAsset: async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    try {
      const access = await resolveAccessContext(req.user);
      if (!access.isHeadofficeAdmin && !isOfficeManager(access.role)) {
        throw createHttpError(403, 'Not permitted to return assets');
      }
      const { returnDate } = req.body as { returnDate?: string };
      const assignment = await AssignmentModel.findById(req.params.id);
      if (!assignment) return res.status(404).json({ message: 'Not found' });
      const assetItem = await AssetItemModel.findById(assignment.asset_item_id);
      if (!assetItem) throw createHttpError(404, 'Asset item not found');
      if (!access.isHeadofficeAdmin && assetItem.location_id) {
        ensureOfficeScope(access, assetItem.location_id.toString());
      }

      await session.withTransaction(async () => {
        assignment.returned_date = returnDate ? new Date(returnDate) : new Date();
        assignment.is_active = false;
        await assignment.save({ session });

        const nextStatus = assetItem.item_status === 'Maintenance' ? 'Maintenance' : 'Available';
        await AssetItemModel.findByIdAndUpdate(
          assignment.asset_item_id,
          { assignment_status: 'Unassigned', item_status: nextStatus },
          { session }
        );

        await createRecord(
          {
            userId: access.userId,
            role: access.role,
            locationId: access.officeId,
            isHeadoffice: access.isHeadofficeAdmin,
          },
          {
            recordType: 'RETURN',
            officeId: assetItem.location_id?.toString(),
            status: 'Completed',
            assetItemId: assignment.asset_item_id.toString(),
            employeeId: assignment.employee_id.toString(),
            assignmentId: assignment.id,
            notes: assignment.notes || undefined,
          },
          session
        );

        await logAudit({
          ctx: {
            userId: access.userId,
            role: access.role,
            locationId: access.officeId,
            isHeadoffice: access.isHeadofficeAdmin,
          },
          action: 'ASSIGN_RETURN',
          entityType: 'Assignment',
          entityId: assignment.id,
          officeId: assetItem.location_id?.toString() || access.officeId || '',
          diff: { returnedDate: assignment.returned_date },
          session,
        });
      });

      res.json(assignment);
    } catch (error) {
      next(error);
    } finally {
      session.endSession();
    }
  },
  reassign: async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    try {
      const access = await resolveAccessContext(req.user);
      if (!access.isHeadofficeAdmin && !isOfficeManager(access.role)) {
        throw createHttpError(403, 'Not permitted to reassign assets');
      }
      const { newEmployeeId, notes } = req.body as { newEmployeeId: string; notes?: string };
      const assignment = await AssignmentModel.findById(req.params.id);
      if (!assignment) return res.status(404).json({ message: 'Not found' });
      if (!assignment.is_active) {
        throw createHttpError(400, 'Cannot reassign an inactive assignment');
      }

      const assetItem = await AssetItemModel.findById(assignment.asset_item_id);
      if (!assetItem) throw createHttpError(404, 'Asset item not found');
      if (!access.isHeadofficeAdmin && assetItem.location_id) {
        ensureOfficeScope(access, assetItem.location_id.toString());
      }

      const employee = await EmployeeModel.findById(newEmployeeId);
      if (!employee) throw createHttpError(404, 'Employee not found');
      if (!access.isHeadofficeAdmin && employee.location_id) {
        ensureOfficeScope(access, employee.location_id.toString());
      }

      await session.withTransaction(async () => {
        assignment.is_active = false;
        assignment.returned_date = new Date();
        await assignment.save({ session });

        const newAssignment = await AssignmentModel.create(
          [
            {
              asset_item_id: assignment.asset_item_id,
              employee_id: newEmployeeId,
              assigned_date: new Date(),
              notes: notes || null,
              is_active: true,
            },
          ],
          { session }
        );

        await AssetItemModel.findByIdAndUpdate(
          assignment.asset_item_id,
          { assignment_status: 'Assigned', item_status: 'Assigned' },
          { session }
        );

        res.json(newAssignment[0]);
      });
    } catch (error) {
      next(error);
    } finally {
      session.endSession();
    }
  },
  remove: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      if (!access.isHeadofficeAdmin && !isOfficeManager(access.role)) {
        throw createHttpError(403, 'Not permitted to remove assignments');
      }
      const assignment = await AssignmentModel.findById(req.params.id);
      if (!assignment) return res.status(404).json({ message: 'Not found' });
      assignment.is_active = false;
      assignment.returned_date = assignment.returned_date || new Date();
      await assignment.save();
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
