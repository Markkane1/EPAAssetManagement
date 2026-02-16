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

const OPEN_ASSIGNMENT_STATUSES = ['DRAFT', 'ISSUED', 'RETURN_REQUESTED'] as const;
const RETURN_SLIP_ALLOWED_STATUSES = new Set(['ISSUED', 'RETURN_REQUESTED']);
const ASSIGNED_TO_TYPES = new Set(['EMPLOYEE', 'SUB_LOCATION']);

const fieldMap = {
  assetItemId: 'asset_item_id',
  employeeId: 'employee_id',
  assignedDate: 'assigned_date',
  expectedReturnDate: 'expected_return_date',
  returnedDate: 'returned_date',
  isActive: 'is_active',
};

type AuthRequestWithFiles = AuthRequest & {
  file?: Express.Multer.File;
  files?:
    | Express.Multer.File[]
    | {
        [fieldname: string]: Express.Multer.File[];
      };
};

type AccessContext = {
  userId: string;
  role: string;
  officeId: string | null;
  isOrgAdmin: boolean;
};

function readParam(req: AuthRequest, key: string) {
  const raw = (req.params as Record<string, string | string[] | undefined>)[key];
  if (Array.isArray(raw)) return String(raw[0] || '').trim();
  return String(raw || '').trim();
}

function clampInt(value: unknown, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.floor(parsed), max));
}

function asNonEmptyString(value: unknown, fieldName: string) {
  const parsed = String(value ?? '').trim();
  if (!parsed) {
    throw createHttpError(400, `${fieldName} is required`);
  }
  return parsed;
}

function asNullableString(value: unknown) {
  if (value === undefined || value === null) return null;
  const parsed = String(value).trim();
  if (!parsed || parsed === 'null' || parsed === 'undefined') return null;
  return parsed;
}

function ensureObjectId(value: string, fieldName: string) {
  if (!Types.ObjectId.isValid(value)) {
    throw createHttpError(400, `${fieldName} is invalid`);
  }
}

function toIdString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Types.ObjectId) return value.toString();
  if (typeof value === 'object') {
    const raw = value as { _id?: unknown; id?: unknown; toHexString?: () => string; toString?: () => string };
    if (typeof raw.toHexString === 'function') return raw.toHexString();
    if (raw._id !== undefined && raw._id !== value) return toIdString(raw._id);
    if (raw.id !== undefined && raw.id !== value) return toIdString(raw.id);
    if (typeof raw.toString === 'function') {
      const parsed = raw.toString();
      if (parsed && parsed !== '[object Object]') return parsed;
    }
  }
  return null;
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

function requireAssetItemOfficeId(item: { holder_type?: string | null; holder_id?: unknown; location_id?: unknown }, message: string) {
  const officeId = getAssetItemOfficeId(item);
  if (!officeId) {
    throw createHttpError(400, message);
  }
  return officeId;
}

function toRequestContext(access: AccessContext) {
  return {
    userId: access.userId,
    role: access.role,
    locationId: access.officeId,
    isOrgAdmin: access.isOrgAdmin,
  };
}

function resolveStoredFileAbsolutePath(storedPath: string) {
  const normalized = storedPath.replace(/\\/g, '/');
  const absolutePath = path.resolve(process.cwd(), normalized);
  const uploadsRoot = path.resolve(process.cwd(), 'uploads');
  if (!absolutePath.startsWith(uploadsRoot)) {
    throw createHttpError(400, 'Invalid file path');
  }
  return absolutePath;
}

function getUploadedFile(req: AuthRequestWithFiles, preferredFields: string[]) {
  if (req.file) return req.file;
  if (Array.isArray(req.files)) {
    return req.files[0] || null;
  }
  if (req.files && typeof req.files === 'object') {
    const mapped = req.files as Record<string, Express.Multer.File[]>;
    for (const field of preferredFields) {
      if (mapped[field]?.[0]) return mapped[field][0];
    }
    if (mapped.file?.[0]) return mapped.file[0];
  }
  return null;
}

async function ensureAssignmentAssetScope(access: AccessContext, assignment: any) {
  const assetItemId = toIdString(assignment.asset_item_id);
  if (!assetItemId) {
    throw createHttpError(400, 'Assignment asset item is missing');
  }
  const assetItem: any = await AssetItemModel.findById(assetItemId);
  if (!assetItem) {
    throw createHttpError(404, 'Asset item not found');
  }
  const officeId = requireAssetItemOfficeId(assetItem, 'Assigned items must be held by an office');
  if (!access.isOrgAdmin) {
    ensureOfficeScope(access, officeId);
  }
  return { assetItem, officeId };
}

async function resolveNotificationOfficeId(assignment: { requisition_id?: unknown }, fallbackOfficeId: string) {
  const requisitionId = toIdString(assignment.requisition_id);
  if (!requisitionId) return fallbackOfficeId;
  const requisition: any = await RequisitionModel.findById(requisitionId, { office_id: 1 }).lean();
  const officeId = requisition?.office_id ? String(requisition.office_id) : null;
  return officeId || fallbackOfficeId;
}

async function resolveNotificationRecipients(officeId: string, assignment: { assigned_to_type?: unknown; assigned_to_id?: unknown }) {
  const managers = await UserModel.find(
    {
      location_id: officeId,
      role: { $in: ['office_head', 'caretaker'] },
      is_active: true,
    },
    { _id: 1 }
  )
    .lean()
    .exec();

  const recipientIds = new Set<string>(managers.map((user) => String(user._id)));
  if (String(assignment.assigned_to_type || '') === 'EMPLOYEE' && assignment.assigned_to_id) {
    const employee: any = await EmployeeModel.findById(assignment.assigned_to_id, { user_id: 1 }).lean().exec();
    const userId = employee?.user_id ? String(employee.user_id) : null;
    if (userId && Types.ObjectId.isValid(userId)) {
      recipientIds.add(userId);
    }
  }
  return Array.from(recipientIds);
}

async function notifyAssignmentEvent(input: {
  assignment: {
    _id?: unknown;
    assigned_to_type?: unknown;
    assigned_to_id?: unknown;
    requisition_id?: unknown;
  };
  officeId: string;
  type:
    | 'ASSIGNMENT_DRAFT_CREATED'
    | 'HANDOVER_SLIP_READY'
    | 'ASSIGNMENT_ISSUED'
    | 'RETURN_REQUESTED'
    | 'RETURN_SLIP_READY'
    | 'ASSIGNMENT_RETURNED';
  title: string;
  message: string;
}) {
  const assignmentId = toIdString(input.assignment._id);
  if (!assignmentId) return [];
  const officeId = await resolveNotificationOfficeId(input.assignment, input.officeId);
  const recipients = await resolveNotificationRecipients(officeId, input.assignment);
  if (recipients.length === 0) return [];

  return createBulkNotifications(
    recipients.map((recipientUserId) => ({
      recipientUserId,
      officeId,
      type: input.type,
      title: input.title,
      message: input.message,
      entityType: 'Assignment',
      entityId: assignmentId,
    }))
  );
}

async function resolveGeneratedSlipFile(params: {
  assignmentId: string;
  generatedByUserId: string;
  kind: 'handover' | 'return';
}) {
  const assignment: any = await AssignmentModel.findById(params.assignmentId, {
    handover_slip_generated_version_id: 1,
    return_slip_generated_version_id: 1,
  }).lean();
  if (!assignment) {
    throw createHttpError(404, 'Assignment not found');
  }

  const generatedVersionId =
    params.kind === 'handover'
      ? toIdString(assignment.handover_slip_generated_version_id)
      : toIdString(assignment.return_slip_generated_version_id);

  if (generatedVersionId) {
    const version: any = await DocumentVersionModel.findById(generatedVersionId, {
      file_path: 1,
      storage_key: 1,
    }).lean();
    const stored = version ? String(version.file_path || version.storage_key || '') : '';
    if (stored) {
      return {
        filePath: stored.replace(/\\/g, '/'),
      };
    }
  }

  const generated =
    params.kind === 'handover'
      ? await generateHandoverSlip({
          assignmentId: params.assignmentId,
          generatedByUserId: params.generatedByUserId,
        })
      : await generateReturnSlip({
          assignmentId: params.assignmentId,
          generatedByUserId: params.generatedByUserId,
        });

  return {
    filePath: generated.filePath,
  };
}

export const assignmentController = {
  list: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const limit = clampInt(req.query.limit, 200, 1000);
      const page = clampInt(req.query.page, 1, 10_000);
      const skip = (page - 1) * limit;
      const access = await resolveAccessContext(req.user);
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
      if (!access.isOrgAdmin) {
        if (!access.officeId) throw createHttpError(403, 'User is not assigned to an office');
        const employee = await EmployeeModel.findById(readParam(req, 'employeeId'));
        if (!employee?.location_id) throw createHttpError(403, 'Employee is not assigned to an office');
        ensureOfficeScope(access, employee.location_id.toString());
      }
      const assignments = await AssignmentModel.find({
        employee_id: readParam(req, 'employeeId'),
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
      if (!access.isOrgAdmin) {
        const item = await AssetItemModel.findById(readParam(req, 'assetItemId'));
        const officeId = item ? getAssetItemOfficeId(item) : null;
        if (!officeId) throw createHttpError(403, 'Access restricted to assigned office');
        ensureOfficeScope(access, officeId);
      }
      const assignments = await AssignmentModel.find({
        asset_item_id: readParam(req, 'assetItemId'),
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
      const file = getUploadedFile(req as AuthRequestWithFiles, ['signedHandoverFile', 'signedFile', 'file']);
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
      const file = getUploadedFile(req as AuthRequestWithFiles, ['signedReturnFile', 'signedFile', 'file']);
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
      const payload = buildPayload(req.body);
      const assignment = await AssignmentModel.findByIdAndUpdate(readParam(req, 'id'), payload, { new: true });
      if (!assignment) return res.status(404).json({ message: 'Not found' });
      return res.json(assignment);
    } catch (error) {
      return next(error);
    }
  },

  returnAsset: async (_req: AuthRequest, _res: Response, next: NextFunction) => {
    return next(createHttpError(400, 'Use return-slip upload flow'));
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


