import fs from 'fs/promises';
import path from 'path';
import type { Express, NextFunction, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import type { AuthRequest } from '../middleware/auth';
import { AssignmentModel } from '../models/assignment.model';
import { AssetItemModel } from '../models/assetItem.model';
import { EmployeeModel } from '../models/employee.model';
import { RequisitionModel } from '../models/requisition.model';
import { RequisitionLineModel } from '../models/requisitionLine.model';
import { RecordModel } from '../models/record.model';
import { DocumentVersionModel } from '../models/documentVersion.model';
import { UserModel } from '../models/user.model';
import { mapFields } from '../utils/mapFields';
import { resolveAccessContext, ensureOfficeScope, isOfficeManager } from '../utils/accessControl';
import { createHttpError } from '../utils/httpError';
import { createRecord } from '../modules/records/services/record.service';
import { uploadDocumentVersion } from '../modules/records/services/document.service';
import { logAudit } from '../modules/records/services/audit.service';
import { getAssetItemOfficeId, officeAssetItemFilter } from '../utils/assetHolder';
import { createBulkNotifications } from '../services/notification.service';
import { generateHandoverSlip, generateReturnSlip } from '../services/assignmentSlip.service';

import {
  OPEN_ASSIGNMENT_STATUSES,
  RETURN_SLIP_ALLOWED_STATUSES,
  ASSIGNED_TO_TYPES,
  fieldMap,
  AuthRequestWithFiles,
  AccessContext,
  readParam,
  clampInt,
  asNonEmptyString,
  asNullableString,
  ensureObjectId,
  toIdString,
  buildPayload,
  requireAssetItemOfficeId,
  toRequestContext,
  resolveStoredFileAbsolutePath,
  getUploadedFile,
  ensureAssignmentAssetScope,
  resolveNotificationOfficeId,
  resolveNotificationRecipients,
  notifyAssignmentEvent,
  resolveGeneratedSlipFile,
} from './assignment.controller.helpers';

async function resolveRequesterEmployeeId(userId: string) {
  const employee: any = await EmployeeModel.findOne({ user_id: userId }, { _id: 1 }).lean();
  if (!employee?._id) {
    throw createHttpError(403, 'Employee mapping not found for user');
  }
  return String(employee._id);
}

function ensureEmployeeOwnsAssignment(assignment: any, requesterEmployeeId: string) {
  const employeeId = assignment?.employee_id ? String(assignment.employee_id) : '';
  const assignedToType = String(assignment?.assigned_to_type || '');
  const assignedToId = assignment?.assigned_to_id ? String(assignment.assigned_to_id) : '';

  const isOwned =
    (assignedToType === 'EMPLOYEE' && assignedToId === requesterEmployeeId) ||
    employeeId === requesterEmployeeId;
  if (!isOwned) {
    throw createHttpError(403, 'Employees can only access their own assignments');
  }
}

export const assignmentController = {
  list: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const limit = clampInt(req.query.limit, 200, 1000);
      const page = clampInt(req.query.page, 1, 10_000);
      const skip = (page - 1) * limit;
      const access = await resolveAccessContext(req.user);

      if (!access.isOrgAdmin && access.role === 'employee') {
        const requesterEmployeeId = await resolveRequesterEmployeeId(access.userId);
        const assignments = await AssignmentModel.find({
          $or: [
            { employee_id: requesterEmployeeId },
            { assigned_to_type: 'EMPLOYEE', assigned_to_id: requesterEmployeeId },
          ],
        })
          .sort({ assigned_date: -1, created_at: -1 })
          .skip(skip)
          .limit(limit);
        return res.json(assignments);
      }

      if (access.isOrgAdmin) {
        const assignments = await AssignmentModel.find()
          .sort({ assigned_date: -1, created_at: -1 })
          .skip(skip)
          .limit(limit);
        return res.json(assignments);
      }
      if (!access.officeId) throw createHttpError(403, 'User is not assigned to an office');
      const assetItemIds = await AssetItemModel.distinct('_id', {
        ...officeAssetItemFilter(access.officeId),
        is_active: true,
      });
      const assignments = await AssignmentModel.find({
        asset_item_id: { $in: assetItemIds },
      })
        .sort({ assigned_date: -1, created_at: -1 })
        .skip(skip)
        .limit(limit);
      return res.json(assignments);
    } catch (error) {
      return next(error);
    }
  },

  getById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const assignment = await AssignmentModel.findById(readParam(req, 'id'));
      if (!assignment) return res.status(404).json({ message: 'Not found' });
      const access = await resolveAccessContext(req.user);

      if (!access.isOrgAdmin && access.role === 'employee') {
        const requesterEmployeeId = await resolveRequesterEmployeeId(access.userId);
        ensureEmployeeOwnsAssignment(assignment, requesterEmployeeId);
        return res.json(assignment);
      }

      await ensureAssignmentAssetScope(access, assignment);
      return res.json(assignment);
    } catch (error) {
      return next(error);
    }
  },

  getByEmployee: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const limit = clampInt(req.query.limit, 200, 1000);
      const page = clampInt(req.query.page, 1, 10_000);
      const access = await resolveAccessContext(req.user);
      const requestedEmployeeId = readParam(req, 'employeeId');

      if (!access.isOrgAdmin && access.role === 'employee') {
        const requesterEmployeeId = await resolveRequesterEmployeeId(access.userId);
        if (requestedEmployeeId !== requesterEmployeeId) {
          throw createHttpError(403, 'Employees can only access their own assignments');
        }
      }

      if (!access.isOrgAdmin) {
        if (access.role !== 'employee') {
          if (!access.officeId) throw createHttpError(403, 'User is not assigned to an office');
          const employee = await EmployeeModel.findById(requestedEmployeeId);
          if (!employee?.location_id) throw createHttpError(403, 'Employee is not assigned to an office');
          ensureOfficeScope(access, employee.location_id.toString());
        }
      }

      const assignments = await AssignmentModel.find({
        employee_id: requestedEmployeeId,
      })
        .sort({ assigned_date: -1, created_at: -1 })
        .skip((page - 1) * limit)
        .limit(limit);
      return res.json(assignments);
    } catch (error) {
      return next(error);
    }
  },

  getByAssetItem: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const limit = clampInt(req.query.limit, 200, 1000);
      const page = clampInt(req.query.page, 1, 10_000);
      const access = await resolveAccessContext(req.user);
      const assetItemId = readParam(req, 'assetItemId');

      if (!access.isOrgAdmin && access.role === 'employee') {
        const requesterEmployeeId = await resolveRequesterEmployeeId(access.userId);
        const assignments = await AssignmentModel.find({
          asset_item_id: assetItemId,
          $or: [
            { employee_id: requesterEmployeeId },
            { assigned_to_type: 'EMPLOYEE', assigned_to_id: requesterEmployeeId },
          ],
        })
          .sort({ assigned_date: -1, created_at: -1 })
          .skip((page - 1) * limit)
          .limit(limit);
        return res.json(assignments);
      }

      if (!access.isOrgAdmin) {
        const item = await AssetItemModel.findById(assetItemId);
        const officeId = item ? getAssetItemOfficeId(item) : null;
        if (!officeId) throw createHttpError(403, 'Access restricted to assigned office');
        ensureOfficeScope(access, officeId);
      }
      const assignments = await AssignmentModel.find({
        asset_item_id: assetItemId,
      })
        .sort({ assigned_date: -1, created_at: -1 })
        .skip((page - 1) * limit)
        .limit(limit);
      return res.json(assignments);
    } catch (error) {
      return next(error);
    }
  },

  create: async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    try {
      const access = await resolveAccessContext(req.user);
      if (!access.isOrgAdmin && !isOfficeManager(access.role)) {
        throw createHttpError(403, 'Not permitted to create assignment drafts');
      }

      const assetItemId = asNonEmptyString(req.body.assetItemId, 'assetItemId');
      const requisitionId = asNonEmptyString(req.body.requisitionId, 'requisitionId');
      const requisitionLineId = asNonEmptyString(req.body.requisitionLineId, 'requisitionLineId');
      const notes = asNullableString(req.body.notes);
      ensureObjectId(assetItemId, 'assetItemId');
      ensureObjectId(requisitionId, 'requisitionId');
      ensureObjectId(requisitionLineId, 'requisitionLineId');

      const [assetItem, requisition, requisitionLine] = await Promise.all([
        AssetItemModel.findById(assetItemId),
        RequisitionModel.findById(requisitionId),
        RequisitionLineModel.findOne({ _id: requisitionLineId, requisition_id: requisitionId }),
      ]);

      if (!assetItem) throw createHttpError(404, 'Asset item not found');
      if (!requisition) throw createHttpError(404, 'Requisition not found');
      if (!requisitionLine) throw createHttpError(404, 'Requisition line not found for this requisition');
      if (String(requisitionLine.line_type) !== 'MOVEABLE') {
        throw createHttpError(400, 'Only MOVEABLE requisition lines can create assignments');
      }

      const assetItemOfficeId = requireAssetItemOfficeId(assetItem, 'Assigned items must be held by an office');
      const requisitionOfficeId = toIdString(requisition.office_id);
      if (!requisitionOfficeId) {
        throw createHttpError(400, 'Requisition office is missing');
      }

      if (!access.isOrgAdmin) {
        ensureOfficeScope(access, assetItemOfficeId);
        ensureOfficeScope(access, requisitionOfficeId);
      }

      if (assetItemOfficeId !== requisitionOfficeId) {
        throw createHttpError(400, 'Asset item must belong to the requisition office');
      }
      if (assetItem.assignment_status !== 'Unassigned') {
        throw createHttpError(400, 'Asset item already assigned');
      }
      if (assetItem.is_active === false) {
        throw createHttpError(400, 'Cannot assign an inactive asset item');
      }

      if (requisitionLine.asset_id && String(requisitionLine.asset_id) !== String(assetItem.asset_id)) {
        throw createHttpError(400, 'Asset item does not match requisition line asset');
      }

      const targetTypeRaw = String(requisition.target_type || '').toUpperCase();
      if (!ASSIGNED_TO_TYPES.has(targetTypeRaw)) {
        throw createHttpError(400, 'Requisition target type is invalid');
      }
      const targetType = targetTypeRaw as 'EMPLOYEE' | 'SUB_LOCATION';
      const targetId = toIdString(requisition.target_id);
      if (!targetId || !Types.ObjectId.isValid(targetId)) {
        throw createHttpError(400, 'Requisition target id is invalid');
      }

      let employeeId: string | null = null;
      if (targetType === 'EMPLOYEE') {
        const targetEmployee: any = await EmployeeModel.findById(targetId, { _id: 1, location_id: 1 }).lean();
        if (!targetEmployee) throw createHttpError(404, 'Target employee not found');
        if (
          targetEmployee.location_id &&
          requisitionOfficeId &&
          String(targetEmployee.location_id) !== requisitionOfficeId
        ) {
          throw createHttpError(400, 'Target employee must belong to requisition office');
        }
        employeeId = targetId;
      }

      let createdAssignment: any = null;
      await session.withTransaction(async () => {
        const existing = await AssignmentModel.findOne({
          asset_item_id: assetItemId,
          status: { $in: OPEN_ASSIGNMENT_STATUSES },
        }).session(session);
        if (existing) {
          throw createHttpError(400, 'Asset item already has an active draft/issued assignment');
        }

        const rows = await AssignmentModel.create(
          [
            {
              asset_item_id: assetItemId,
              status: 'DRAFT',
              assigned_to_type: targetType,
              assigned_to_id: targetId,
              employee_id: employeeId,
              requisition_id: requisitionId,
              requisition_line_id: requisitionLineId,
              assigned_date: new Date(),
              expected_return_date: null,
              returned_date: null,
              notes: notes || null,
              is_active: true,
            },
          ],
          { session }
        );

        createdAssignment = rows[0];

        await logAudit({
          ctx: toRequestContext(access),
          action: 'ASSIGN_DRAFT_CREATE',
          entityType: 'Assignment',
          entityId: rows[0].id,
          officeId: requisitionOfficeId,
          diff: {
            status: 'DRAFT',
            requisitionId,
            requisitionLineId,
            targetType,
            targetId,
          },
          session,
        });
      });

      if (!createdAssignment) {
        throw createHttpError(500, 'Failed to create assignment draft');
      }

      await notifyAssignmentEvent({
        assignment: createdAssignment,
        officeId: requisitionOfficeId,
        type: 'ASSIGNMENT_DRAFT_CREATED',
        title: 'Assignment Draft Created',
        message: `Draft assignment created for requisition ${String(requisition.file_number || requisitionId)}.`,
      });

      return res.status(201).json(createdAssignment);
    } catch (error) {
      return next(error);
    } finally {
      session.endSession();
    }
  },

  handoverSlipPdf: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      const assignment = await AssignmentModel.findById(readParam(req, 'id'));
      if (!assignment) throw createHttpError(404, 'Assignment not found');
      const { officeId } = await ensureAssignmentAssetScope(access, assignment);

      if (String(assignment.status) !== 'DRAFT') {
        throw createHttpError(400, 'Handover slip can be generated only for DRAFT assignments');
      }

      const slip = await resolveGeneratedSlipFile({
        assignmentId: assignment.id,
        generatedByUserId: access.userId,
        kind: 'handover',
      });

      await notifyAssignmentEvent({
        assignment,
        officeId,
        type: 'HANDOVER_SLIP_READY',
        title: 'Handover Slip Ready',
        message: `Handover slip is ready for assignment ${assignment.id}.`,
      });

      const absolutePath = resolveStoredFileAbsolutePath(slip.filePath);
      await fs.access(absolutePath);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="handover-slip-${assignment.id}.pdf"`);
      return res.sendFile(absolutePath);
    } catch (error) {
      return next(error);
    }
  },

  uploadSignedHandoverSlip: async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    try {
      const file = getUploadedFile(req as AuthRequestWithFiles, ['signedHandoverFile']);
      if (!file) throw createHttpError(400, 'File is required');

      const access = await resolveAccessContext(req.user);
      if (!access.isOrgAdmin && !isOfficeManager(access.role)) {
        throw createHttpError(403, 'Not permitted to upload signed handover slip');
      }

      let assignment = await AssignmentModel.findById(readParam(req, 'id'));
      if (!assignment) throw createHttpError(404, 'Assignment not found');
      const { officeId } = await ensureAssignmentAssetScope(access, assignment);

      if (String(assignment.status) !== 'DRAFT') {
        throw createHttpError(400, 'Signed handover upload is allowed only for DRAFT assignments');
      }

      if (!assignment.handover_slip_document_id || !assignment.handover_slip_generated_version_id) {
        await generateHandoverSlip({
          assignmentId: assignment.id,
          generatedByUserId: access.userId,
        });
        assignment = await AssignmentModel.findById(readParam(req, 'id'));
      }

      if (!assignment?.handover_slip_document_id) {
        throw createHttpError(400, 'Handover slip document is missing');
      }

      const signedVersion = await uploadDocumentVersion(
        toRequestContext(access),
        String(assignment.handover_slip_document_id),
        file
      );

      let updatedAssignment: any = null;
      const issuedAt = new Date();
      await session.withTransaction(async () => {
        updatedAssignment = await AssignmentModel.findOneAndUpdate(
          { _id: assignment?._id, status: 'DRAFT' },
          {
            $set: {
              handover_slip_signed_version_id: signedVersion._id,
              status: 'ISSUED',
              issued_by_user_id: access.userId,
              issued_at: issuedAt,
              is_active: true,
            },
          },
          { new: true, session }
        );

        if (!updatedAssignment) {
          throw createHttpError(400, 'Assignment is no longer in DRAFT state');
        }

        await AssetItemModel.findByIdAndUpdate(
          assignment?.asset_item_id,
          { assignment_status: 'Assigned', item_status: 'Assigned' },
          { session }
        );

        const existingIssueRecord = await RecordModel.findOne({
          record_type: 'ISSUE',
          assignment_id: assignment?._id,
        }).session(session);
        if (existingIssueRecord) {
          existingIssueRecord.status = 'Completed';
          existingIssueRecord.asset_item_id = assignment?.asset_item_id || existingIssueRecord.asset_item_id || null;
          existingIssueRecord.employee_id = assignment?.employee_id || existingIssueRecord.employee_id || null;
          if (!existingIssueRecord.notes && assignment?.notes) {
            existingIssueRecord.notes = assignment.notes;
          }
          await existingIssueRecord.save({ session });
        } else {
          await createRecord(
            toRequestContext(access),
            {
              recordType: 'ISSUE',
              officeId,
              status: 'Completed',
              assetItemId: String(assignment?.asset_item_id),
              employeeId: assignment?.employee_id ? String(assignment.employee_id) : undefined,
              assignmentId: String(assignment?._id),
              notes: asNullableString(assignment?.notes) || undefined,
            },
            session
          );
        }

        await logAudit({
          ctx: toRequestContext(access),
          action: 'ASSIGN_ISSUE_FROM_SIGNED_HANDOVER',
          entityType: 'Assignment',
          entityId: String(assignment?._id),
          officeId,
          diff: {
            status: 'ISSUED',
            signedVersionId: String(signedVersion._id),
          },
          session,
        });
      });

      if (!updatedAssignment) {
        throw createHttpError(500, 'Failed to issue assignment');
      }

      await notifyAssignmentEvent({
        assignment: updatedAssignment,
        officeId,
        type: 'ASSIGNMENT_ISSUED',
        title: 'Assignment Issued',
        message: `Assignment ${updatedAssignment.id} has been issued.`,
      });

      return res.json(updatedAssignment);
    } catch (error) {
      return next(error);
    } finally {
      session.endSession();
    }
  },

  requestReturn: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      const assignment = await AssignmentModel.findById(readParam(req, 'id'));
      if (!assignment) throw createHttpError(404, 'Assignment not found');
      const { officeId } = await ensureAssignmentAssetScope(access, assignment);

      if (String(assignment.status) !== 'ISSUED') {
        throw createHttpError(400, 'Return can be requested only for ISSUED assignments');
      }

      if (!access.isOrgAdmin && access.role === 'employee') {
        const requesterEmployee: any = await EmployeeModel.findOne({ user_id: access.userId }, { _id: 1 }).lean();
        if (!requesterEmployee) {
          throw createHttpError(403, 'Employee mapping not found for user');
        }
        if (
          String(assignment.assigned_to_type) !== 'EMPLOYEE' ||
          String(assignment.assigned_to_id || '') !== String(requesterEmployee._id)
        ) {
          throw createHttpError(403, 'Employees can only request return for their own assignments');
        }
      } else if (!access.isOrgAdmin && !isOfficeManager(access.role)) {
        throw createHttpError(403, 'Not permitted to request return');
      }

      const now = new Date();
      const updated = await AssignmentModel.findOneAndUpdate(
        { _id: assignment._id, status: 'ISSUED' },
        {
          $set: {
            status: 'RETURN_REQUESTED',
            return_requested_by_user_id: access.userId,
            return_requested_at: now,
            is_active: true,
          },
        },
        { new: true }
      );
      if (!updated) {
        throw createHttpError(400, 'Assignment is no longer in ISSUED state');
      }

      await notifyAssignmentEvent({
        assignment: updated,
        officeId,
        type: 'RETURN_REQUESTED',
        title: 'Return Requested',
        message: `Return requested for assignment ${updated.id}.`,
      });

      return res.json(updated);
    } catch (error) {
      return next(error);
    }
  },

  returnSlipPdf: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      const assignment = await AssignmentModel.findById(readParam(req, 'id'));
      if (!assignment) throw createHttpError(404, 'Assignment not found');
      const { officeId } = await ensureAssignmentAssetScope(access, assignment);

      if (!RETURN_SLIP_ALLOWED_STATUSES.has(String(assignment.status))) {
        throw createHttpError(400, 'Return slip can be generated only for ISSUED or RETURN_REQUESTED assignments');
      }

      const slip = await resolveGeneratedSlipFile({
        assignmentId: assignment.id,
        generatedByUserId: access.userId,
        kind: 'return',
      });

      await notifyAssignmentEvent({
        assignment,
        officeId,
        type: 'RETURN_SLIP_READY',
        title: 'Return Slip Ready',
        message: `Return slip is ready for assignment ${assignment.id}.`,
      });

      const absolutePath = resolveStoredFileAbsolutePath(slip.filePath);
      await fs.access(absolutePath);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="return-slip-${assignment.id}.pdf"`);
      return res.sendFile(absolutePath);
    } catch (error) {
      return next(error);
    }
  },
  uploadSignedReturnSlip: async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    try {
      const file = getUploadedFile(req as AuthRequestWithFiles, ['signedReturnFile']);
      if (!file) throw createHttpError(400, 'File is required');

      const access = await resolveAccessContext(req.user);
      if (!access.isOrgAdmin && !isOfficeManager(access.role)) {
        throw createHttpError(403, 'Not permitted to upload signed return slip');
      }

      let assignment = await AssignmentModel.findById(readParam(req, 'id'));
      if (!assignment) throw createHttpError(404, 'Assignment not found');
      const { assetItem, officeId } = await ensureAssignmentAssetScope(access, assignment);

      if (!RETURN_SLIP_ALLOWED_STATUSES.has(String(assignment.status))) {
        throw createHttpError(400, 'Signed return upload allowed only for ISSUED or RETURN_REQUESTED assignments');
      }

      if (!assignment.return_slip_document_id || !assignment.return_slip_generated_version_id) {
        await generateReturnSlip({
          assignmentId: assignment.id,
          generatedByUserId: access.userId,
        });
        assignment = await AssignmentModel.findById(readParam(req, 'id'));
      }

      if (!assignment?.return_slip_document_id) {
        throw createHttpError(400, 'Return slip document is missing');
      }

      const signedVersion = await uploadDocumentVersion(
        toRequestContext(access),
        String(assignment.return_slip_document_id),
        file
      );

      const returnedAt = new Date();
      const nextItemStatus = assetItem.item_status === 'Maintenance' ? 'Maintenance' : 'Available';
      let updatedAssignment: any = null;

      await session.withTransaction(async () => {
        updatedAssignment = await AssignmentModel.findOneAndUpdate(
          {
            _id: assignment?._id,
            status: { $in: ['ISSUED', 'RETURN_REQUESTED'] },
          },
          {
            $set: {
              return_slip_signed_version_id: signedVersion._id,
              status: 'RETURNED',
              returned_by_user_id: access.userId,
              returned_at: returnedAt,
              returned_date: returnedAt,
              is_active: false,
            },
          },
          { new: true, session }
        );
        if (!updatedAssignment) {
          throw createHttpError(400, 'Assignment is no longer in ISSUED/RETURN_REQUESTED state');
        }

        await AssetItemModel.findByIdAndUpdate(
          assignment?.asset_item_id,
          { assignment_status: 'Unassigned', item_status: nextItemStatus },
          { session }
        );

        await createRecord(
          toRequestContext(access),
          {
            recordType: 'RETURN',
            officeId,
            status: 'Completed',
            assetItemId: String(assignment?.asset_item_id),
            employeeId: assignment?.employee_id ? String(assignment.employee_id) : undefined,
            assignmentId: String(assignment?._id),
            notes: asNullableString(assignment?.notes) || undefined,
          },
          session
        );

        await logAudit({
          ctx: toRequestContext(access),
          action: 'ASSIGN_RETURN_FROM_SIGNED_SLIP',
          entityType: 'Assignment',
          entityId: String(assignment?._id),
          officeId,
          diff: {
            status: 'RETURNED',
            signedVersionId: String(signedVersion._id),
          },
          session,
        });
      });

      if (!updatedAssignment) {
        throw createHttpError(500, 'Failed to complete return');
      }

      await notifyAssignmentEvent({
        assignment: updatedAssignment,
        officeId,
        type: 'ASSIGNMENT_RETURNED',
        title: 'Assignment Returned',
        message: `Assignment ${updatedAssignment.id} has been returned.`,
      });

      return res.json(updatedAssignment);
    } catch (error) {
      return next(error);
    } finally {
      session.endSession();
    }
  },

  update: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      if (!access.isOrgAdmin && !isOfficeManager(access.role)) {
        throw createHttpError(403, 'Not permitted to update assignments');
      }
      const assignment = await AssignmentModel.findById(readParam(req, 'id'));
      if (!assignment) return res.status(404).json({ message: 'Not found' });
      await ensureAssignmentAssetScope(access, assignment);

      const payload = buildPayload(req.body);
      if (payload.asset_item_id) {
        const targetItem: any = await AssetItemModel.findById(String(payload.asset_item_id));
        if (!targetItem) {
          throw createHttpError(404, 'Target asset item not found');
        }
        const targetOfficeId = requireAssetItemOfficeId(targetItem, 'Assigned items must be held by an office');
        if (!access.isOrgAdmin) {
          ensureOfficeScope(access, targetOfficeId);
        }
      }

      const updated = await AssignmentModel.findByIdAndUpdate(assignment._id, payload, { new: true });
      if (!updated) return res.status(404).json({ message: 'Not found' });
      return res.json(updated);
    } catch (error) {
      return next(error);
    }
  },

  reassign: async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    try {
      const access = await resolveAccessContext(req.user);
      if (!access.isOrgAdmin && !isOfficeManager(access.role)) {
        throw createHttpError(403, 'Not permitted to reassign assets');
      }

      const newEmployeeId = asNonEmptyString(req.body.newEmployeeId, 'newEmployeeId');
      const notes = asNullableString(req.body.notes);
      ensureObjectId(newEmployeeId, 'newEmployeeId');

      const assignment = await AssignmentModel.findById(readParam(req, 'id'));
      if (!assignment) return res.status(404).json({ message: 'Not found' });
      const { assetItem, officeId } = await ensureAssignmentAssetScope(access, assignment);

      if (String(assignment.status) !== 'RETURNED') {
        throw createHttpError(400, 'Reassign is allowed only after assignment is RETURNED');
      }
      if (assetItem.assignment_status !== 'Unassigned') {
        throw createHttpError(400, 'Asset item must be Unassigned before reassigning');
      }

      const employee = await EmployeeModel.findById(newEmployeeId);
      if (!employee) throw createHttpError(404, 'Employee not found');
      if (!access.isOrgAdmin && employee.location_id) {
        ensureOfficeScope(access, employee.location_id.toString());
      }

      let createdAssignment: any = null;
      await session.withTransaction(async () => {
        const existing = await AssignmentModel.findOne({
          asset_item_id: assignment.asset_item_id,
          status: { $in: OPEN_ASSIGNMENT_STATUSES },
        }).session(session);
        if (existing) {
          throw createHttpError(400, 'Asset item already has an open assignment');
        }

        const rows = await AssignmentModel.create(
          [
            {
              asset_item_id: assignment.asset_item_id,
              status: 'DRAFT',
              assigned_to_type: 'EMPLOYEE',
              assigned_to_id: newEmployeeId,
              employee_id: newEmployeeId,
              requisition_id: assignment.requisition_id,
              requisition_line_id: assignment.requisition_line_id,
              assigned_date: new Date(),
              expected_return_date: null,
              returned_date: null,
              notes: notes || null,
              is_active: true,
            },
          ],
          { session }
        );

        createdAssignment = rows[0];

        await logAudit({
          ctx: toRequestContext(access),
          action: 'ASSIGN_REASSIGN_DRAFT_CREATE',
          entityType: 'Assignment',
          entityId: rows[0].id,
          officeId,
          diff: {
            fromAssignmentId: assignment.id,
            toEmployeeId: newEmployeeId,
            status: 'DRAFT',
          },
          session,
        });
      });

      if (!createdAssignment) {
        throw createHttpError(500, 'Failed to create reassignment draft');
      }

      await notifyAssignmentEvent({
        assignment: createdAssignment,
        officeId,
        type: 'ASSIGNMENT_DRAFT_CREATED',
        title: 'Assignment Draft Created',
        message: `Reassignment draft created from assignment ${assignment.id}.`,
      });

      return res.json(createdAssignment);
    } catch (error) {
      return next(error);
    } finally {
      session.endSession();
    }
  },

  remove: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      if (!access.isOrgAdmin && !isOfficeManager(access.role)) {
        throw createHttpError(403, 'Not permitted to remove assignments');
      }
      const assignment = await AssignmentModel.findById(readParam(req, 'id'));
      if (!assignment) return res.status(404).json({ message: 'Not found' });
      await ensureAssignmentAssetScope(access, assignment);
      await AssignmentModel.updateOne(
        { _id: assignment._id },
        {
          $set: {
            status: 'CANCELLED',
            is_active: false,
            returned_date: assignment.returned_date || new Date(),
          },
        }
      );
      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  },
};


