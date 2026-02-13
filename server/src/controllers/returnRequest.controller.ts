import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { NextFunction, Response } from 'express';
import type { Express } from 'express';
import mongoose, { Types } from 'mongoose';
import type { AuthRequest } from '../middleware/auth';
import { ReturnRequestModel } from '../models/returnRequest.model';
import { EmployeeModel } from '../models/employee.model';
import { OfficeModel } from '../models/office.model';
import { AssignmentModel } from '../models/assignment.model';
import { AssetItemModel } from '../models/assetItem.model';
import { AssetModel } from '../models/asset.model';
import { RecordModel } from '../models/record.model';
import { DocumentModel } from '../models/document.model';
import { DocumentVersionModel } from '../models/documentVersion.model';
import { DocumentLinkModel } from '../models/documentLink.model';
import { createHttpError } from '../utils/httpError';
import { getRequestContext } from '../utils/scope';
import { isOfficeManager } from '../utils/accessControl';
import { logAudit } from '../modules/records/services/audit.service';
import { createRecord } from '../modules/records/services/record.service';
import { generateAndStoreReturnReceipt } from '../services/returnRequestReceipt.service';

const RECEIVE_ALLOWED_STATUSES = new Set(['SUBMITTED', 'RECEIVED_CONFIRMED']);
const SIGNED_UPLOAD_ALLOWED_STATUSES = new Set(['CLOSED_PENDING_SIGNATURE']);

type AuthRequestWithFiles = AuthRequest & {
  files?:
    | Express.Multer.File[]
    | {
        [fieldname: string]: Express.Multer.File[];
      };
};

function asNullableString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const parsed = String(value).trim();
  if (!parsed || parsed === 'null' || parsed === 'undefined') return null;
  return parsed;
}

function parseBoolean(value: unknown, fieldName: string) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const parsed = value.trim().toLowerCase();
    if (parsed === 'true') return true;
    if (parsed === 'false' || parsed === '') return false;
  }
  if (value === undefined || value === null) return false;
  throw createHttpError(400, `${fieldName} must be a boolean`);
}

function parseAssetItemIds(value: unknown) {
  if (value === undefined || value === null || value === '') return [] as string[];
  if (!Array.isArray(value)) {
    throw createHttpError(400, 'assetItemIds must be an array');
  }

  const seen = new Set<string>();
  const parsed: string[] = [];
  value.forEach((row, index) => {
    const id = String(row ?? '').trim();
    if (!id) {
      throw createHttpError(400, `assetItemIds[${index}] is required`);
    }
    if (!Types.ObjectId.isValid(id)) {
      throw createHttpError(400, `assetItemIds[${index}] is invalid`);
    }
    if (seen.has(id)) return;
    seen.add(id);
    parsed.push(id);
  });
  return parsed;
}

function uniqueIds(ids: Array<string | null | undefined>) {
  return Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
}

function displayEmployeeName(employee: {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}) {
  const fullName = `${String(employee.first_name || '').trim()} ${String(employee.last_name || '').trim()}`.trim();
  if (fullName) return fullName;
  return String(employee.email || 'Unknown Employee');
}

function getSignedReturnFile(req: AuthRequestWithFiles) {
  if (req.file) return req.file;
  if (Array.isArray(req.files)) {
    return req.files[0];
  }
  if (req.files && typeof req.files === 'object') {
    const asMap = req.files as Record<string, Express.Multer.File[]>;
    return asMap.signedReturnFile?.[0] || asMap.file?.[0] || null;
  }
  return null;
}

export const returnRequestController = {
  create: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      const returnAll = parseBoolean(req.body?.returnAll, 'returnAll');
      const assetItemIds = parseAssetItemIds(req.body?.assetItemIds);
      const requestedEmployeeId = asNullableString(req.body?.employeeId);
      const requestedOfficeId = asNullableString(req.body?.officeId);

      if (returnAll && assetItemIds.length > 0) {
        throw createHttpError(400, 'Use either returnAll=true or assetItemIds, not both');
      }
      if (!returnAll && assetItemIds.length === 0) {
        throw createHttpError(400, 'assetItemIds is required when returnAll is false');
      }

      if (requestedEmployeeId && !Types.ObjectId.isValid(requestedEmployeeId)) {
        throw createHttpError(400, 'employeeId is invalid');
      }
      if (requestedOfficeId && !Types.ObjectId.isValid(requestedOfficeId)) {
        throw createHttpError(400, 'officeId is invalid');
      }

      const requesterEmployee = await EmployeeModel.findOne(
        { user_id: ctx.userId },
        { _id: 1, location_id: 1, directorate_id: 1 }
      ).lean();

      const employeeId = requestedEmployeeId || (requesterEmployee?._id ? String(requesterEmployee._id) : null);
      if (!employeeId) {
        throw createHttpError(400, 'employeeId is required');
      }

      const employee = await EmployeeModel.findById(employeeId, { _id: 1, location_id: 1, directorate_id: 1 }).lean();
      if (!employee) {
        throw createHttpError(404, 'Employee not found');
      }

      const officeId =
        requestedOfficeId ||
        uniqueIds([
          employee.location_id ? String(employee.location_id) : null,
          employee.directorate_id ? String(employee.directorate_id) : null,
        ])[0] ||
        null;

      if (!officeId) {
        throw createHttpError(400, 'officeId is required');
      }

      const officeExists = await OfficeModel.exists({ _id: officeId });
      if (!officeExists) {
        throw createHttpError(404, 'Office not found');
      }

      const employeeOfficeIds = uniqueIds([
        employee.location_id ? String(employee.location_id) : null,
        employee.directorate_id ? String(employee.directorate_id) : null,
      ]);
      if (!employeeOfficeIds.includes(officeId)) {
        throw createHttpError(400, 'Employee does not belong to the selected office');
      }

      const requesterEmployeeId = requesterEmployee?._id ? String(requesterEmployee._id) : null;
      if (!ctx.isHeadoffice && !isOfficeManager(ctx.role) && requesterEmployeeId !== employeeId) {
        throw createHttpError(403, 'Users can only create return requests for themselves');
      }

      if (!ctx.isHeadoffice) {
        if (!ctx.locationId) throw createHttpError(403, 'User is not assigned to an office');
        if (ctx.locationId !== officeId) {
          throw createHttpError(403, 'Access restricted to assigned office');
        }
      }

      const assetFilter = { location_id: officeId, is_active: true };
      let selectedAssetItemIds: string[] = [];

      if (returnAll) {
        const officeAssetIds = await AssetItemModel.find(assetFilter).distinct('_id');
        if (officeAssetIds.length === 0) {
          throw createHttpError(400, 'No returnable asset items found for this office');
        }

        const activeAssignments = await AssignmentModel.find(
          {
            employee_id: employeeId,
            is_active: true,
            returned_date: null,
            asset_item_id: { $in: officeAssetIds },
          },
          { asset_item_id: 1 }
        ).lean();

        selectedAssetItemIds = uniqueIds(
          activeAssignments.map((assignment) =>
            assignment.asset_item_id ? String(assignment.asset_item_id) : null
          )
        );
        if (selectedAssetItemIds.length === 0) {
          throw createHttpError(400, 'No active assignments found for employee in this office');
        }
      } else {
        const officeAssetRows = await AssetItemModel.find(
          { ...assetFilter, _id: { $in: assetItemIds } },
          { _id: 1 }
        ).lean();
        const officeAssetIds = new Set(officeAssetRows.map((row) => String(row._id)));
        const outsideOffice = assetItemIds.filter((id) => !officeAssetIds.has(id));
        if (outsideOffice.length > 0) {
          throw createHttpError(400, 'Some assetItemIds do not belong to the selected office');
        }

        const assignments = await AssignmentModel.find(
          {
            employee_id: employeeId,
            is_active: true,
            returned_date: null,
            asset_item_id: { $in: assetItemIds },
          },
          { asset_item_id: 1 }
        ).lean();
        const assignedIds = new Set(
          assignments
            .map((assignment) => (assignment.asset_item_id ? String(assignment.asset_item_id) : null))
            .filter((id): id is string => Boolean(id))
        );
        const invalidRequested = assetItemIds.filter((id) => !assignedIds.has(id));
        if (invalidRequested.length > 0) {
          throw createHttpError(400, 'Some asset items are not actively assigned to the employee');
        }
        selectedAssetItemIds = assetItemIds;
      }

      const payload = {
        employee_id: employeeId,
        office_id: officeId,
        status: 'SUBMITTED' as const,
        lines: selectedAssetItemIds.map((assetId) => ({ asset_item_id: assetId })),
      };

      const returnRequest = await ReturnRequestModel.create(payload);

      await logAudit({
        ctx,
        action: 'RETURN_REQUEST_SUBMIT',
        entityType: 'ReturnRequest',
        entityId: returnRequest.id,
        officeId,
        diff: {
          employeeId,
          returnAll,
          lineCount: selectedAssetItemIds.length,
          assetItemIds: selectedAssetItemIds,
          status: returnRequest.status,
        },
      });

      return res.status(201).json(returnRequest);
    } catch (error) {
      return next(error);
    }
  },
  receive: async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    try {
      const ctx = await getRequestContext(req);
      if (!ctx.isHeadoffice && !isOfficeManager(ctx.role)) {
        throw createHttpError(403, 'Not permitted to receive return requests');
      }

      let responsePayload: {
        returnRequest: unknown;
        record: unknown;
        receiptDocument: unknown;
        receiptVersion: unknown;
        closedAssignmentIds: string[];
      } | null = null;

      await session.withTransaction(async () => {
        const returnRequest = await ReturnRequestModel.findById(req.params.id).session(session);
        if (!returnRequest) {
          throw createHttpError(404, 'Return request not found');
        }
        if (!RECEIVE_ALLOWED_STATUSES.has(String(returnRequest.status))) {
          throw createHttpError(400, 'Return request cannot be received in current status');
        }

        const officeId = returnRequest.office_id?.toString();
        if (!officeId) {
          throw createHttpError(400, 'Return request office is missing');
        }
        if (!ctx.isHeadoffice && ctx.locationId !== officeId) {
          throw createHttpError(403, 'Access restricted to assigned office');
        }

        const employeeId = returnRequest.employee_id?.toString();
        if (!employeeId) {
          throw createHttpError(400, 'Return request employee is missing');
        }
        const employee = await EmployeeModel.findById(employeeId, {
          first_name: 1,
          last_name: 1,
          email: 1,
          location_id: 1,
          directorate_id: 1,
        })
          .session(session)
          .lean();
        if (!employee) {
          throw createHttpError(404, 'Employee not found');
        }

        const office = await OfficeModel.findById(officeId, { name: 1 }).session(session).lean();
        if (!office) {
          throw createHttpError(404, 'Office not found');
        }

        const lineAssetItemIds = uniqueIds(
          (Array.isArray(returnRequest.lines) ? returnRequest.lines : []).map((line: any) =>
            line?.asset_item_id ? String(line.asset_item_id) : null
          )
        );
        if (lineAssetItemIds.length === 0) {
          throw createHttpError(400, 'Return request has no lines');
        }

        const assignments = await AssignmentModel.find({
          employee_id: employeeId,
          asset_item_id: { $in: lineAssetItemIds },
          is_active: true,
          returned_date: null,
        }).session(session);
        if (assignments.length !== lineAssetItemIds.length) {
          throw createHttpError(400, 'Some requested asset items do not have active assignments to this employee');
        }

        const assetItems = await AssetItemModel.find(
          { _id: { $in: lineAssetItemIds }, location_id: officeId, is_active: true },
          { asset_id: 1, tag: 1, serial_number: 1, assignment_status: 1, item_status: 1 }
        ).session(session);
        if (assetItems.length !== lineAssetItemIds.length) {
          throw createHttpError(400, 'Some requested asset items do not belong to this office');
        }

        const now = new Date();
        const closedAssignmentIds: string[] = [];
        for (const assignment of assignments) {
          assignment.returned_date = now;
          assignment.is_active = false;
          await assignment.save({ session });
          closedAssignmentIds.push(assignment.id);
        }

        for (const item of assetItems) {
          item.assignment_status = 'Unassigned';
          item.item_status = item.item_status === 'Maintenance' ? 'Maintenance' : 'Available';
          await item.save({ session });
        }

        const record = await createRecord(
          ctx,
          {
            recordType: 'RETURN',
            officeId,
            status: 'Draft',
            employeeId,
            notes: `Return request ${returnRequest.id} received; ${lineAssetItemIds.length} item(s) closed`,
          },
          session
        );

        const assetIds = uniqueIds(assetItems.map((item) => (item.asset_id ? String(item.asset_id) : null)));
        const assets = assetIds.length
          ? await AssetModel.find({ _id: { $in: assetIds } }, { name: 1 }).session(session).lean()
          : [];
        const assetNameById = new Map(assets.map((asset) => [String(asset._id), String(asset.name || '')]));
        const lineData = assetItems.map((item) => ({
          assetItemId: item.id,
          assetName: assetNameById.get(String(item.asset_id)) || 'Unknown Asset',
          tag: String(item.tag || ''),
          serialNumber: String(item.serial_number || ''),
        }));

        const receipt = await generateAndStoreReturnReceipt({
          session,
          officeId,
          officeName: String(office.name || 'Unknown Office'),
          employeeName: displayEmployeeName(employee),
          returnRequestId: returnRequest.id,
          recordId: record.id,
          createdByUserId: ctx.userId,
          lines: lineData,
        });

        returnRequest.record_id = record._id as any;
        returnRequest.receipt_document_id = receipt.document._id as any;
        returnRequest.status = 'CLOSED_PENDING_SIGNATURE';
        await returnRequest.save({ session });

        await logAudit({
          ctx,
          action: 'RETURN_REQUEST_RECEIVE',
          entityType: 'ReturnRequest',
          entityId: returnRequest.id,
          officeId,
          diff: {
            status: returnRequest.status,
            closedAssignmentIds,
            recordId: record.id,
            receiptDocumentId: receipt.document.id,
            receiptVersionId: receipt.version.id,
            lineCount: lineAssetItemIds.length,
          },
          session,
        });

        responsePayload = {
          returnRequest: returnRequest.toJSON(),
          record: record.toJSON(),
          receiptDocument: receipt.document.toJSON(),
          receiptVersion: receipt.version.toJSON(),
          closedAssignmentIds,
        };
      });

      if (!responsePayload) {
        throw createHttpError(500, 'Failed to receive return request');
      }
      return res.json(responsePayload);
    } catch (error) {
      return next(error);
    } finally {
      session.endSession();
    }
  },
  uploadSignedReturn: async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    const uploadedFile = getSignedReturnFile(req as AuthRequestWithFiles);
    try {
      if (!uploadedFile) {
        throw createHttpError(400, 'Signed return file is required');
      }

      const ctx = await getRequestContext(req);
      if (!ctx.isHeadoffice && !isOfficeManager(ctx.role)) {
        throw createHttpError(403, 'Not permitted to upload signed return');
      }

      let responsePayload: {
        returnRequest: unknown;
        record: unknown;
        document: unknown;
        documentVersion: unknown;
      } | null = null;

      await session.withTransaction(async () => {
        const returnRequest = await ReturnRequestModel.findById(req.params.id).session(session);
        if (!returnRequest) {
          throw createHttpError(404, 'Return request not found');
        }
        if (!SIGNED_UPLOAD_ALLOWED_STATUSES.has(String(returnRequest.status))) {
          throw createHttpError(400, 'Signed upload is allowed only in CLOSED_PENDING_SIGNATURE');
        }

        const officeId = returnRequest.office_id?.toString();
        if (!officeId) {
          throw createHttpError(400, 'Return request office is missing');
        }
        if (!ctx.isHeadoffice && ctx.locationId !== officeId) {
          throw createHttpError(403, 'Access restricted to assigned office');
        }

        if (!returnRequest.record_id) {
          throw createHttpError(400, 'Associated return record is missing');
        }
        const record = await RecordModel.findById(returnRequest.record_id).session(session);
        if (!record) {
          throw createHttpError(404, 'Associated return record not found');
        }
        if (String(record.record_type) !== 'RETURN') {
          throw createHttpError(400, 'Associated record must be a RETURN record');
        }

        let returnSlipDoc: any = null;
        if (returnRequest.receipt_document_id) {
          returnSlipDoc = await DocumentModel.findById(returnRequest.receipt_document_id).session(session);
        }
        if (!returnSlipDoc) {
          returnSlipDoc = await DocumentModel.create(
            [
              {
                title: `Return Slip ${returnRequest.id}`,
                doc_type: 'ReturnSlip',
                status: 'Final',
                office_id: officeId,
                created_by_user_id: ctx.userId,
              },
            ],
            { session }
          ).then((rows) => rows[0]);
          returnRequest.receipt_document_id = returnSlipDoc._id as any;
        } else {
          if (String(returnSlipDoc.doc_type) !== 'ReturnSlip') {
            throw createHttpError(400, 'Receipt document must be a ReturnSlip');
          }
          returnSlipDoc.status = 'Final';
          await returnSlipDoc.save({ session });
        }

        const linkExists = await DocumentLinkModel.findOne({
          document_id: returnSlipDoc._id,
          entity_type: 'Record',
          entity_id: record._id,
        }).session(session);
        if (!linkExists) {
          await DocumentLinkModel.create(
            [
              {
                document_id: returnSlipDoc._id,
                entity_type: 'Record',
                entity_id: record._id,
                required_for_status: 'Completed',
              },
            ],
            { session }
          );
        }

        const relativePath = path.join('uploads', 'documents', path.basename(uploadedFile.path)).replace(/\\/g, '/');
        const fileBuffer = await fs.readFile(uploadedFile.path);
        const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
        const lastVersion = await DocumentVersionModel.findOne({ document_id: returnSlipDoc._id }, { version_no: 1 })
          .sort({ version_no: -1 })
          .session(session)
          .lean();
        const nextVersion =
          lastVersion && typeof lastVersion.version_no === 'number' ? Number(lastVersion.version_no) + 1 : 1;
        const versionId = new Types.ObjectId();

        const version = await DocumentVersionModel.create(
          [
            {
              _id: versionId,
              document_id: returnSlipDoc._id,
              version_no: nextVersion,
              file_name: uploadedFile.originalname,
              mime_type: uploadedFile.mimetype,
              size_bytes: uploadedFile.size,
              storage_key: relativePath,
              file_path: relativePath,
              file_url: `/api/documents/versions/${versionId.toString()}/download`,
              sha256,
              uploaded_by_user_id: ctx.userId,
              uploaded_at: new Date(),
            },
          ],
          { session }
        ).then((rows) => rows[0]);

        record.status = 'Completed';
        await record.save({ session });

        returnRequest.status = 'CLOSED';
        await returnRequest.save({ session });

        await logAudit({
          ctx,
          action: 'RETURN_REQUEST_SIGNED_RETURN_UPLOAD',
          entityType: 'ReturnRequest',
          entityId: returnRequest.id,
          officeId,
          diff: {
            status: returnRequest.status,
            recordId: record.id,
            recordStatus: record.status,
            documentId: returnSlipDoc.id,
            documentStatus: returnSlipDoc.status,
            documentVersionId: version.id,
          },
          session,
        });

        responsePayload = {
          returnRequest: returnRequest.toJSON(),
          record: record.toJSON(),
          document: returnSlipDoc.toJSON(),
          documentVersion: version.toJSON(),
        };
      });

      if (!responsePayload) {
        throw createHttpError(500, 'Failed to upload signed return');
      }
      return res.json(responsePayload);
    } catch (error) {
      if (uploadedFile?.path) {
        try {
          await fs.unlink(uploadedFile.path);
        } catch {
          // ignore cleanup failures
        }
      }
      return next(error);
    } finally {
      session.endSession();
    }
  },
};
