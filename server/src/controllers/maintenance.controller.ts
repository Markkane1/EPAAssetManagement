import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { MaintenanceRecordModel } from '../models/maintenanceRecord.model';
import { AssetItemModel } from '../models/assetItem.model';
import { VendorModel } from '../models/vendor.model';
import { EmployeeModel } from '../models/employee.model';
import { AssignmentModel } from '../models/assignment.model';
import { mapFields } from '../utils/mapFields';
import type { AuthRequest } from '../middleware/auth';
import { resolveAccessContext, ensureOfficeScope } from '../utils/accessControl';
import { createHttpError } from '../utils/httpError';
import { createRecord, updateRecordStatus } from '../modules/records/services/record.service';
import { RecordModel } from '../models/record.model';
import { logAudit } from '../modules/records/services/audit.service';
import { DocumentLinkModel } from '../models/documentLink.model';
import { DocumentModel } from '../models/document.model';
import { DocumentVersionModel } from '../models/documentVersion.model';
import { getAssetItemOfficeId, officeAssetItemFilter } from '../utils/assetHolder';
import { createBulkNotifications, resolveNotificationRecipientsByOffice } from '../services/notification.service';
import { enforceAccessPolicy } from '../services/policyEngine.service';

function clampInt(value: unknown, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.floor(parsed), max));
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function hasCompletionDocs(maintenanceRecordId: string) {
  const record = await RecordModel.findOne({
    record_type: 'MAINTENANCE',
    maintenance_record_id: maintenanceRecordId,
  });
  const entityFilters: Array<{ entity_type: string; entity_id: string }> = [
    { entity_type: 'MaintenanceRecord', entity_id: maintenanceRecordId },
  ];
  if (record) {
    entityFilters.push({ entity_type: 'Record', entity_id: record.id });
  }

  const links = await DocumentLinkModel.find({ $or: entityFilters });
  if (links.length === 0) return false;
  const docIds = links.map((link) => link.document_id);

  const documents = await DocumentModel.find({
    _id: { $in: docIds },
    doc_type: { $in: ['MaintenanceJobCard', 'Invoice'] },
  });
  if (documents.length === 0) return false;

  const docIdList = documents.map((doc) => doc.id);
  const version = await DocumentVersionModel.exists({ document_id: { $in: docIdList } });
  return Boolean(version);
}

const fieldMap = {
  assetItemId: 'asset_item_id',
  maintenanceType: 'maintenance_type',
  maintenanceStatus: 'maintenance_status',
  performedBy: 'performed_by',
  performedByVendorId: 'performed_by_vendor_id',
  estimateDocumentId: 'estimate_document_id',
  scheduledDate: 'scheduled_date',
  completedDate: 'completed_date',
};

function normalizeNullableString(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function buildPayload(body: Record<string, unknown>) {
  const payload = mapFields(body, fieldMap);
  Object.values(fieldMap).forEach((dbKey) => {
    if (body[dbKey] !== undefined) {
      payload[dbKey] = body[dbKey];
    }
  });
  if (body.description !== undefined) payload.description = body.description;
  if (body.cost !== undefined) payload.cost = body.cost;
  if (body.notes !== undefined) payload.notes = body.notes;
  if (payload.performed_by_vendor_id !== undefined) {
    payload.performed_by_vendor_id = normalizeNullableString(payload.performed_by_vendor_id);
  }
  if (payload.estimate_document_id !== undefined) {
    payload.estimate_document_id = normalizeNullableString(payload.estimate_document_id);
  }
  if (payload.scheduled_date) payload.scheduled_date = new Date(String(payload.scheduled_date));
  if (payload.completed_date) payload.completed_date = new Date(String(payload.completed_date));
  return payload;
}

function requireAssetItemOfficeId(item: { holder_type?: string | null; holder_id?: unknown; location_id?: unknown }, message: string) {
  const officeId = getAssetItemOfficeId(item);
  if (!officeId) {
    throw createHttpError(400, message);
  }
  return officeId;
}

function toRecordId(record: any) {
  if (record?._id) return String(record._id);
  if (record?.id) return String(record.id);
  return '';
}

function toIsoDateLabel(value: unknown) {
  const parsed = value ? new Date(String(value)) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return 'unspecified date';
  return parsed.toLocaleDateString();
}

async function notifyMaintenanceEvent(input: {
  maintenanceRecord: any;
  officeId: string;
  type:
    | 'MAINTENANCE_SCHEDULED'
    | 'MAINTENANCE_DUE'
    | 'MAINTENANCE_OVERDUE'
    | 'MAINTENANCE_COMPLETED'
    | 'MAINTENANCE_UPDATED'
    | 'MAINTENANCE_REMOVED';
  title: string;
  message: string;
  excludeUserIds?: string[];
  dedupeWindowHours?: number;
}) {
  const recordId = toRecordId(input.maintenanceRecord);
  if (!recordId) return;

  const recipients = await resolveNotificationRecipientsByOffice({
    officeIds: [input.officeId],
    includeOrgAdmins: true,
    includeRoles: ['office_head', 'caretaker'],
    excludeUserIds: input.excludeUserIds,
  });
  if (recipients.length === 0) return;

  await createBulkNotifications(
    recipients.map((recipientUserId) => ({
      recipientUserId,
      officeId: input.officeId,
      type: input.type,
      title: input.title,
      message: input.message,
      entityType: 'MaintenanceRecord',
      entityId: recordId,
      dedupeWindowHours: input.dedupeWindowHours ?? 24,
    }))
  );
}

async function ensureMaintenanceScope(
  access: Awaited<ReturnType<typeof resolveAccessContext>>,
  maintenanceRecord: { asset_item_id?: unknown }
) {
  const item = await AssetItemModel.findById(maintenanceRecord.asset_item_id);
  const officeId = item ? getAssetItemOfficeId(item) : null;
  if (!officeId) {
    throw createHttpError(403, 'Access restricted to assigned office');
  }
  if (!access.isOrgAdmin) {
    ensureOfficeScope(access, officeId);
  }
  return officeId;
}

function toPolicyActor(access: Awaited<ReturnType<typeof resolveAccessContext>>, req: AuthRequest) {
  return {
    userId: access.userId,
    role: access.role,
    roles: req.user?.roles || [access.role],
    officeId: access.officeId,
    isOrgAdmin: access.isOrgAdmin,
  };
}

async function resolveMaintenanceVendor(params: {
  vendorId: unknown;
  officeId: string;
}) {
  const vendorId = normalizeNullableString(params.vendorId);
  if (!vendorId) {
    throw createHttpError(400, 'Performed by vendor is required');
  }

  if (!mongoose.Types.ObjectId.isValid(vendorId)) {
    throw createHttpError(400, 'Performed by vendor is invalid');
  }

  const vendor: any = await VendorModel.findById(vendorId, { _id: 1, office_id: 1, name: 1 }).lean();
  if (!vendor) {
    throw createHttpError(400, 'Selected vendor does not exist');
  }

  const vendorOfficeId = vendor.office_id ? String(vendor.office_id) : null;
  if (!vendorOfficeId || vendorOfficeId !== params.officeId) {
    throw createHttpError(400, 'Performed by vendor must belong to the same office as the asset item');
  }

  return { id: String(vendor._id), name: String(vendor.name || '') };
}

async function validateEstimateDocument(params: {
  documentId: unknown;
  officeId: string;
  session?: mongoose.ClientSession;
}) {
  const documentId = normalizeNullableString(params.documentId);
  if (!documentId) {
    throw createHttpError(400, 'Estimate document is required');
  }
  if (!mongoose.Types.ObjectId.isValid(documentId)) {
    throw createHttpError(400, 'Estimate document is invalid');
  }

  let documentQuery = DocumentModel.findById(documentId, { _id: 1, office_id: 1, doc_type: 1 }).lean();
  if (params.session) {
    documentQuery = documentQuery.session(params.session);
  }
  const document: any = await documentQuery;
  if (!document) {
    throw createHttpError(400, 'Estimate document not found');
  }

  const officeId = document.office_id ? String(document.office_id) : null;
  if (!officeId || officeId !== params.officeId) {
    throw createHttpError(400, 'Estimate document must belong to the same office as the asset item');
  }
  if (String(document.doc_type || '') !== 'MaintenanceEstimate') {
    throw createHttpError(400, 'Estimate document type must be MaintenanceEstimate');
  }

  let versionQuery = DocumentVersionModel.exists({
    document_id: documentId,
    mime_type: 'application/pdf',
  });
  if (params.session) {
    versionQuery = versionQuery.session(params.session);
  }
  const hasPdfVersion = await versionQuery;
  if (!hasPdfVersion) {
    throw createHttpError(400, 'Estimate document must have an uploaded PDF version');
  }

  return { id: String(document._id) };
}

async function resolveRequesterEmployee(req: AuthRequest, projection: Record<string, 1>) {
  const userId = String(req.user?.userId || '').trim();
  if (!userId) return null;

  const byUserId: any = await EmployeeModel.findOne(
    { user_id: userId, is_active: { $ne: false } },
    projection
  ).lean();
  if (byUserId?._id) return byUserId;

  const requesterEmail = String(req.user?.email || '').trim();
  if (!requesterEmail) return null;
  const byEmail: any = await EmployeeModel.findOne(
    {
      email: { $regex: `^${escapeRegex(requesterEmail)}$`, $options: 'i' },
      is_active: { $ne: false },
    },
    projection
  ).lean();
  return byEmail || null;
}

async function resolveRequesterEmployeeId(req: AuthRequest) {
  const employee: any = await resolveRequesterEmployee(req, { _id: 1 });
  if (!employee?._id) {
    throw createHttpError(403, 'Employee mapping not found for user');
  }
  return String(employee._id);
}

async function resolveActiveEmployeeAssetItemIds(employeeId: string, officeId?: string | null) {
  const assignmentRows: any[] = await AssignmentModel.find(
    {
      employee_id: employeeId,
      is_active: true,
      returned_date: null,
    },
    { asset_item_id: 1 }
  )
    .lean()
    .exec();
  const assignedAssetItemIds = Array.from(
    new Set(
      assignmentRows
        .map((assignment) => String(assignment.asset_item_id || ''))
        .filter(Boolean)
    )
  );
  if (assignedAssetItemIds.length === 0) return [];
  if (!officeId) return assignedAssetItemIds;

  const scopedAssetItems: any[] = await AssetItemModel.find(
    {
      _id: { $in: assignedAssetItemIds },
      ...officeAssetItemFilter(officeId),
      is_active: { $ne: false },
    },
    { _id: 1 }
  )
    .lean()
    .exec();
  return scopedAssetItems.map((item) => String(item._id));
}

export const maintenanceController = {
  list: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const limit = clampInt(req.query.limit, 200, 1000);
      const page = clampInt(req.query.page, 1, 10_000);
      const access = await resolveAccessContext(req.user);
      const isEmployeeRequester = access.role === 'employee';
      if (access.isOrgAdmin) {
        const records = await MaintenanceRecordModel.find({ is_active: { $ne: false } })
          .sort({ created_at: -1 })
          .skip((page - 1) * limit)
          .limit(limit);
        return res.json(records);
      }
      if (!access.officeId) throw createHttpError(403, 'User is not assigned to an office');
      if (isEmployeeRequester) {
        const requesterEmployeeId = await resolveRequesterEmployeeId(req);
        const employeeAssetItemIds = await resolveActiveEmployeeAssetItemIds(
          requesterEmployeeId,
          access.officeId
        );
        if (employeeAssetItemIds.length === 0) {
          return res.json([]);
        }
        const records = await MaintenanceRecordModel.find({
          asset_item_id: { $in: employeeAssetItemIds },
          is_active: { $ne: false },
        })
          .sort({ created_at: -1 })
          .skip((page - 1) * limit)
          .limit(limit);
        return res.json(records);
      }
      const assetItemIds = await AssetItemModel.distinct('_id', {
        ...officeAssetItemFilter(access.officeId),
        is_active: { $ne: false },
      });
      const records = await MaintenanceRecordModel.find({
        asset_item_id: { $in: assetItemIds },
        is_active: { $ne: false },
      })
        .sort({ created_at: -1 })
        .skip((page - 1) * limit)
        .limit(limit);
      res.json(records);
    } catch (error) {
      next(error);
    }
  },
  getScheduled: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const limit = clampInt(req.query.limit, 200, 1000);
      const page = clampInt(req.query.page, 1, 10_000);
      const access = await resolveAccessContext(req.user);
      const isEmployeeRequester = access.role === 'employee';
      const filter: Record<string, unknown> = {
        maintenance_status: 'Scheduled',
        is_active: { $ne: false },
      };
      if (!access.isOrgAdmin) {
        if (!access.officeId) throw createHttpError(403, 'User is not assigned to an office');
        if (isEmployeeRequester) {
          const requesterEmployeeId = await resolveRequesterEmployeeId(req);
          const employeeAssetItemIds = await resolveActiveEmployeeAssetItemIds(
            requesterEmployeeId,
            access.officeId
          );
          if (employeeAssetItemIds.length === 0) {
            return res.json([]);
          }
          filter.asset_item_id = { $in: employeeAssetItemIds };
        } else {
          const assetItemIds = await AssetItemModel.distinct('_id', {
            ...officeAssetItemFilter(access.officeId),
            is_active: { $ne: false },
          });
          filter.asset_item_id = { $in: assetItemIds };
        }
      }
      const records = await MaintenanceRecordModel.find(filter)
        .sort({ created_at: -1 })
        .skip((page - 1) * limit)
        .limit(limit);
      res.json(records);
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const record = await MaintenanceRecordModel.findById(req.params.id);
      if (!record) return res.status(404).json({ message: 'Not found' });
      const access = await resolveAccessContext(req.user);
      if (!access.isOrgAdmin && access.role === 'employee') {
        const requesterEmployeeId = await resolveRequesterEmployeeId(req);
        const employeeAssetItemIds = await resolveActiveEmployeeAssetItemIds(
          requesterEmployeeId,
          access.officeId
        );
        if (!employeeAssetItemIds.includes(String(record.asset_item_id || ''))) {
          throw createHttpError(403, 'Employees can only access maintenance for assigned asset items');
        }
      } else if (!access.isOrgAdmin) {
        const item = await AssetItemModel.findById(record.asset_item_id);
        const officeId = item ? getAssetItemOfficeId(item) : null;
        if (!officeId) throw createHttpError(403, 'Access restricted to assigned office');
        ensureOfficeScope(access, officeId);
      }
      return res.json(record);
    } catch (error) {
      next(error);
    }
  },
  getByAssetItem: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const limit = clampInt(req.query.limit, 200, 1000);
      const page = clampInt(req.query.page, 1, 10_000);
      const access = await resolveAccessContext(req.user);
      if (!access.isOrgAdmin && access.role === 'employee') {
        const requesterEmployeeId = await resolveRequesterEmployeeId(req);
        const employeeAssetItemIds = await resolveActiveEmployeeAssetItemIds(
          requesterEmployeeId,
          access.officeId
        );
        if (!employeeAssetItemIds.includes(String(req.params.assetItemId || ''))) {
          throw createHttpError(403, 'Employees can only access maintenance for assigned asset items');
        }
      } else if (!access.isOrgAdmin) {
        const item = await AssetItemModel.findById(req.params.assetItemId);
        const officeId = item ? getAssetItemOfficeId(item) : null;
        if (!officeId) throw createHttpError(403, 'Access restricted to assigned office');
        ensureOfficeScope(access, officeId);
      }
      const records = await MaintenanceRecordModel.find({
        asset_item_id: req.params.assetItemId,
        is_active: { $ne: false },
      })
        .sort({ created_at: -1 })
        .skip((page - 1) * limit)
        .limit(limit);
      res.json(records);
    } catch (error) {
      next(error);
    }
  },
  create: async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    try {
      const access = await resolveAccessContext(req.user);
      const isEmployeeRequester = access.role === 'employee';
      const payload = buildPayload(req.body);
      if (!payload.maintenance_type) payload.maintenance_type = 'Preventive';
      if (!payload.maintenance_status) payload.maintenance_status = 'Scheduled';
      if (!payload.asset_item_id) throw createHttpError(400, 'Asset item is required');

      const assetItem = await AssetItemModel.findById(payload.asset_item_id);
      if (!assetItem) throw createHttpError(404, 'Asset item not found');
      if (assetItem.is_active === false) {
        throw createHttpError(400, 'Cannot create maintenance for an inactive asset item');
      }
      const assetItemOfficeId = requireAssetItemOfficeId(assetItem, 'Maintenance is allowed only for office-held assets');
      await enforceAccessPolicy({
        action: 'maintenance.create',
        actor: toPolicyActor(access, req),
        targetOfficeId: assetItemOfficeId,
        errorMessage: 'Not permitted to create maintenance records',
      });
      if (!access.isOrgAdmin) {
        ensureOfficeScope(access, assetItemOfficeId);
      }
      let requesterEmployeeId: string | null = null;
      if (isEmployeeRequester) {
        requesterEmployeeId = await resolveRequesterEmployeeId(req);
        const employeeAssetItemIds = await resolveActiveEmployeeAssetItemIds(
          requesterEmployeeId,
          access.officeId
        );
        if (!employeeAssetItemIds.includes(String(payload.asset_item_id || ''))) {
          throw createHttpError(
            403,
            'Employees can only request maintenance for currently assigned asset items'
          );
        }
        payload.performed_by_vendor_id = null;
        payload.estimate_document_id = null;
        payload.performed_by = normalizeNullableString(payload.performed_by) || 'Employee Request';
      } else {
        const vendor = await resolveMaintenanceVendor({
          vendorId: payload.performed_by_vendor_id,
          officeId: assetItemOfficeId,
        });
        payload.performed_by_vendor_id = vendor.id;
        payload.performed_by = vendor.name;
      }
      let createdRecord: any = null;

      await session.withTransaction(async () => {
        if (!isEmployeeRequester) {
          const estimateDocument = await validateEstimateDocument({
            documentId: payload.estimate_document_id,
            officeId: assetItemOfficeId,
            session,
          });
          payload.estimate_document_id = estimateDocument.id;
        }

        const record = await MaintenanceRecordModel.create([payload], { session });
        createdRecord = record[0];
        if (!isEmployeeRequester && payload.estimate_document_id) {
          await DocumentLinkModel.create(
            [
              {
                document_id: payload.estimate_document_id,
                entity_type: 'MaintenanceRecord',
                entity_id: record[0].id,
              },
            ],
            { session }
          );
        }
        await AssetItemModel.findByIdAndUpdate(
          payload.asset_item_id,
          { item_status: 'Maintenance' },
          { session }
        );

        await createRecord(
          {
            userId: access.userId,
            role: access.role,
            locationId: access.officeId,
            isOrgAdmin: access.isOrgAdmin,
          },
          {
            recordType: 'MAINTENANCE',
              officeId: assetItemOfficeId,
              status: isEmployeeRequester ? 'Draft' : 'Approved',
              assetItemId: payload.asset_item_id as string,
              employeeId: requesterEmployeeId || undefined,
              maintenanceRecordId: record[0].id,
              notes: payload.notes as string | undefined,
            },
            session
        );

        await logAudit({
          ctx: {
            userId: access.userId,
            role: access.role,
            locationId: access.officeId,
            isOrgAdmin: access.isOrgAdmin,
          },
          action: 'MAINTENANCE_CREATE',
          entityType: 'MaintenanceRecord',
          entityId: record[0].id,
          officeId: assetItemOfficeId || access.officeId || '',
          diff: { maintenanceStatus: record[0].maintenance_status },
          session,
        });
      });
      if (!createdRecord) {
        throw createHttpError(500, 'Failed to create maintenance record');
      }
      if (String(createdRecord.maintenance_status || '') === 'Scheduled') {
        await notifyMaintenanceEvent({
          maintenanceRecord: createdRecord,
          officeId: assetItemOfficeId,
          type: 'MAINTENANCE_SCHEDULED',
          title: 'Maintenance Scheduled',
          message: `Maintenance has been scheduled for ${toIsoDateLabel(createdRecord.scheduled_date)}.`,
          excludeUserIds: [access.userId],
        });
      }
      res.status(201).json(createdRecord);
    } catch (error) {
      next(error);
    } finally {
      session.endSession();
    }
  },
  update: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      await enforceAccessPolicy({
        action: 'maintenance.manage',
        actor: toPolicyActor(access, req),
        errorMessage: 'Not permitted to update maintenance records',
      });
      const current = await MaintenanceRecordModel.findById(req.params.id);
      if (!current) return res.status(404).json({ message: 'Not found' });
      await ensureMaintenanceScope(access, current);

      const payload = buildPayload(req.body);
      let targetOfficeId: string | null = null;
      if (payload.asset_item_id) {
        const targetItem = await AssetItemModel.findById(payload.asset_item_id);
        if (!targetItem) throw createHttpError(404, 'Target asset item not found');
        targetOfficeId = requireAssetItemOfficeId(targetItem, 'Maintenance is allowed only for office-held assets');
        if (!access.isOrgAdmin) {
          ensureOfficeScope(access, targetOfficeId);
        }
      } else {
        const currentItem = await AssetItemModel.findById(current.asset_item_id);
        targetOfficeId = currentItem
          ? requireAssetItemOfficeId(currentItem, 'Maintenance is allowed only for office-held assets')
          : null;
      }

      if (!targetOfficeId) {
        throw createHttpError(400, 'Unable to resolve office for maintenance record');
      }

      if (payload.performed_by_vendor_id !== undefined || payload.asset_item_id) {
        const candidateVendorId = payload.performed_by_vendor_id ?? current.performed_by_vendor_id;
        if (candidateVendorId) {
          const vendor = await resolveMaintenanceVendor({
            vendorId: candidateVendorId,
            officeId: targetOfficeId,
          });
          payload.performed_by_vendor_id = vendor.id;
          payload.performed_by = vendor.name;
        }
      }

      if (payload.estimate_document_id !== undefined || payload.asset_item_id) {
        const candidateDocumentId = payload.estimate_document_id ?? current.estimate_document_id;
        if (candidateDocumentId) {
          const estimateDocument = await validateEstimateDocument({
            documentId: candidateDocumentId,
            officeId: targetOfficeId,
          });
          payload.estimate_document_id = estimateDocument.id;
        }
      }

      Object.assign(current, payload);
      await current.save();
      if (payload.estimate_document_id) {
        await DocumentLinkModel.updateOne(
          {
            document_id: payload.estimate_document_id,
            entity_type: 'MaintenanceRecord',
            entity_id: current.id,
          },
          {
            $setOnInsert: {
              document_id: payload.estimate_document_id,
              entity_type: 'MaintenanceRecord',
              entity_id: current.id,
            },
          },
          { upsert: true }
        );
      }
      await notifyMaintenanceEvent({
        maintenanceRecord: current,
        officeId: targetOfficeId,
        type: 'MAINTENANCE_UPDATED',
        title: 'Maintenance Updated',
        message: `Maintenance record was updated for scheduled date ${toIsoDateLabel(current.scheduled_date)}.`,
        excludeUserIds: [access.userId],
        dedupeWindowHours: 12,
      });
      return res.json(current);
    } catch (error) {
      next(error);
    }
  },
  complete: async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    try {
      const access = await resolveAccessContext(req.user);
      await enforceAccessPolicy({
        action: 'maintenance.manage',
        actor: toPolicyActor(access, req),
        errorMessage: 'Not permitted to complete maintenance',
      });
      const { completedDate } = req.body as { completedDate?: string };
      const record = await MaintenanceRecordModel.findById(req.params.id);
      if (!record) return res.status(404).json({ message: 'Not found' });
      const assetItem = await AssetItemModel.findById(record.asset_item_id);
      if (!assetItem) throw createHttpError(404, 'Asset item not found');
      const assetItemOfficeId = requireAssetItemOfficeId(assetItem, 'Maintenance is allowed only for office-held assets');
      if (!access.isOrgAdmin) {
        ensureOfficeScope(access, assetItemOfficeId);
      }
      const hasDocs = await hasCompletionDocs(record.id);
      if (!hasDocs) {
        throw createHttpError(
          400,
          'Maintenance completion requires a Maintenance Job Card or Invoice document version'
        );
      }

      await session.withTransaction(async () => {
        record.maintenance_status = 'Completed';
        record.completed_date = completedDate ? new Date(completedDate) : new Date();
        await record.save({ session });

        const nextStatus = assetItem.assignment_status === 'Assigned' ? 'Assigned' : 'Available';
        await AssetItemModel.findByIdAndUpdate(
          record.asset_item_id,
          { item_status: nextStatus },
          { session }
        );

        const existingRecord = await RecordModel.findOne({
          record_type: 'MAINTENANCE',
          maintenance_record_id: record.id,
        }).session(session);

        if (existingRecord) {
          await updateRecordStatus(
            {
              userId: access.userId,
              role: access.role,
              locationId: access.officeId,
              isOrgAdmin: access.isOrgAdmin,
            },
            existingRecord.id,
            'Completed',
            record.notes || undefined,
            session
          );
        } else {
          await createRecord(
            {
              userId: access.userId,
              role: access.role,
              locationId: access.officeId,
              isOrgAdmin: access.isOrgAdmin,
            },
            {
              recordType: 'MAINTENANCE',
              officeId: assetItemOfficeId,
              status: 'Completed',
              assetItemId: record.asset_item_id.toString(),
              maintenanceRecordId: record.id,
              notes: record.notes || undefined,
            },
            session
          );
        }

        await logAudit({
          ctx: {
            userId: access.userId,
            role: access.role,
            locationId: access.officeId,
            isOrgAdmin: access.isOrgAdmin,
          },
          action: 'MAINTENANCE_COMPLETE',
          entityType: 'MaintenanceRecord',
          entityId: record.id,
          officeId: assetItemOfficeId || access.officeId || '',
          diff: { completedDate: record.completed_date },
          session,
        });
      });

      await notifyMaintenanceEvent({
        maintenanceRecord: record,
        officeId: assetItemOfficeId,
        type: 'MAINTENANCE_COMPLETED',
        title: 'Maintenance Completed',
        message: `Maintenance was completed on ${toIsoDateLabel(record.completed_date)}.`,
        excludeUserIds: [access.userId],
      });

      res.json(record);
    } catch (error) {
      next(error);
    } finally {
      session.endSession();
    }
  },
  remove: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      await enforceAccessPolicy({
        action: 'maintenance.manage',
        actor: toPolicyActor(access, req),
        errorMessage: 'Not permitted to remove maintenance records',
      });
      const record = await MaintenanceRecordModel.findById(req.params.id);
      if (!record) return res.status(404).json({ message: 'Not found' });
      const officeId = await ensureMaintenanceScope(access, record);
      record.is_active = false;
      await record.save();
      await notifyMaintenanceEvent({
        maintenanceRecord: record,
        officeId,
        type: 'MAINTENANCE_REMOVED',
        title: 'Maintenance Removed',
        message: 'A maintenance record was removed from active workflow.',
        excludeUserIds: [access.userId],
        dedupeWindowHours: 12,
      });
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};


