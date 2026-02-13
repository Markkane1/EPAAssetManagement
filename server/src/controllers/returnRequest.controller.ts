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

function parseDateInput(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw createHttpError(400, `${fieldName} must be a valid date`);
  }
  return parsed;
}

function parsePositiveInt(value: unknown, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.floor(parsed), max));
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
  list: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      const canViewAll = ctx.role === 'super_admin' || ctx.isHeadoffice;
      const page = parsePositiveInt(req.query.page, 1, 100_000);
      const limit = parsePositiveInt(req.query.limit, 50, 200);
      const skip = (page - 1) * limit;
      const officeId = asNullableString(req.query.officeId);
      const status = asNullableString(req.query.status);
      const employeeId = asNullableString(req.query.employeeId);
      const from = parseDateInput(req.query.from, 'from');
      const to = parseDateInput(req.query.to, 'to');

      if (officeId && !Types.ObjectId.isValid(officeId)) {
        throw createHttpError(400, 'officeId is invalid');
      }
      if (employeeId && !Types.ObjectId.isValid(employeeId)) {
        throw createHttpError(400, 'employeeId is invalid');
      }
      if (from && to && from.getTime() > to.getTime()) {
        throw createHttpError(400, 'from must be earlier than or equal to to');
      }

      const filter: Record<string, unknown> = {};
      if (!canViewAll) {
        if (!ctx.locationId) throw createHttpError(403, 'User is not assigned to an office');
        if (officeId && officeId !== ctx.locationId) {
          throw createHttpError(403, 'Access restricted to assigned office');
        }
        filter.office_id = ctx.locationId;
      } else if (officeId) {
        filter.office_id = officeId;
      }

      if (status) filter.status = status;
      if (employeeId) filter.employee_id = employeeId;
      if (from || to) {
        const createdAt: Record<string, Date> = {};
        if (from) createdAt.$gte = from;
        if (to) createdAt.$lte = to;
        filter.created_at = createdAt;
      }

      const [data, total] = await Promise.all([
        ReturnRequestModel.find(filter).sort({ created_at: -1 }).skip(skip).limit(limit).lean(),
        ReturnRequestModel.countDocuments(filter),
      ]);

      return res.json({
        data,
        page,
        limit,
        total,
      });
    } catch (error) {
      return next(error);
    }
  },
  getById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const ctx = await getRequestContext(req);
      const canViewAll = ctx.role === 'super_admin' || ctx.isHeadoffice;
      const returnRequest = await ReturnRequestModel.findById(req.params.id).lean();
      if (!returnRequest) {
        throw createHttpError(404, 'Return request not found');
      }

      const officeId = returnRequest.office_id ? String(returnRequest.office_id) : null;
      if (!officeId) throw createHttpError(400, 'Return request office is missing');
      if (!canViewAll) {
        if (!ctx.locationId) throw createHttpError(403, 'User is not assigned to an office');
        if (ctx.locationId !== officeId) {
          throw createHttpError(403, 'Access restricted to assigned office');
        }
      }

      const linkQuery: Record<string, unknown>[] = [
        { entity_type: 'ReturnRequest', entity_id: returnRequest._id },
      ];
      if (returnRequest.record_id) {
        linkQuery.push({ entity_type: 'Record', entity_id: returnRequest.record_id });
      }
      const linkedRows = await DocumentLinkModel.find(
        { $or: linkQuery },
        { document_id: 1, entity_type: 1, entity_id: 1, required_for_status: 1 }
      ).lean();

      const linkedDocumentIds = uniqueIds(
        linkedRows.map((row) => (row.document_id ? String(row.document_id) : null))
      );
      const directReceiptId = returnRequest.receipt_document_id ? String(returnRequest.receipt_document_id) : null;
      const docIds = uniqueIds([...linkedDocumentIds, directReceiptId]);

      const docs = docIds.length
        ? await DocumentModel.find({ _id: { $in: docIds } }).sort({ created_at: -1 }).lean()
        : [];
      const latestVersionMap = new Map<string, unknown>();
      await Promise.all(
        docs.map(async (doc) => {
          const version = await DocumentVersionModel.findOne(
            { document_id: doc._id },
            { version_no: 1, file_name: 1, mime_type: 1, size_bytes: 1, uploaded_at: 1, file_url: 1 }
          )
            .sort({ version_no: -1 })
            .lean();
          latestVersionMap.set(String(doc._id), version || null);
        })
      );

      const linkRefsByDocId = new Map<string, Array<Record<string, unknown>>>();
      linkedRows.forEach((row) => {
        const docId = row.document_id ? String(row.document_id) : null;
        if (!docId) return;
        const current = linkRefsByDocId.get(docId) || [];
        current.push({
          entity_type: row.entity_type,
          entity_id: row.entity_id,
          required_for_status: row.required_for_status ?? null,
        });
        linkRefsByDocId.set(docId, current);
      });

      const summarizedDocs = docs.map((doc) => ({
        id: doc._id,
        title: doc.title,
        doc_type: doc.doc_type,
        status: doc.status,
        created_at: doc.created_at,
        latestVersion: latestVersionMap.get(String(doc._id)) || null,
        links: linkRefsByDocId.get(String(doc._id)) || [],
      }));
      const receiptDocument = directReceiptId
        ? summarizedDocs.find((doc) => String(doc.id) === directReceiptId) || null
        : null;

      return res.json({
        returnRequest,
        lines: Array.isArray(returnRequest.lines) ? returnRequest.lines : [],
        documents: {
          receiptDocument,
          linked: summarizedDocs,
        },
      });
    } catch (error) {
      return next(error);
    }
  },
  receiptPdf: async (req: AuthRequest, res: Response, next: NextFunction) => {
    let session: mongoose.ClientSession | null = null;
    try {
      const ctx = await getRequestContext(req);
      const returnRequest = await ReturnRequestModel.findById(req.params.id).lean();
      if (!returnRequest) {
        throw createHttpError(404, 'Return request not found');
      }

      const officeId = returnRequest.office_id ? String(returnRequest.office_id) : null;
      if (!officeId) throw createHttpError(400, 'Return request office is missing');

      const isIssuer = ctx.isHeadoffice || isOfficeManager(ctx.role);
      let isOwnerEmployee = false;
      if (!isIssuer) {
        const requesterEmployee = await EmployeeModel.findOne({ user_id: ctx.userId }, { _id: 1 }).lean();
        isOwnerEmployee =
          Boolean(requesterEmployee?._id) &&
          String(requesterEmployee?._id) === String(returnRequest.employee_id || '');
      }
      if (!isIssuer && !isOwnerEmployee) {
        throw createHttpError(403, 'Not permitted to view return receipt');
      }
      if (!ctx.isHeadoffice && isIssuer) {
        if (!ctx.locationId) throw createHttpError(403, 'User is not assigned to an office');
        if (ctx.locationId !== officeId) {
          throw createHttpError(403, 'Access restricted to assigned office');
        }
      }

      let receiptDocumentId = returnRequest.receipt_document_id ? String(returnRequest.receipt_document_id) : null;
      if (!receiptDocumentId) {
        session = await mongoose.startSession();
        await session.withTransaction(async () => {
          const requestDoc = await ReturnRequestModel.findById(req.params.id).session(session!);
          if (!requestDoc) {
            throw createHttpError(404, 'Return request not found');
          }
          if (requestDoc.receipt_document_id) {
            receiptDocumentId = String(requestDoc.receipt_document_id);
            return;
          }
          if (!requestDoc.record_id) {
            throw createHttpError(400, 'Return receipt cannot be generated before receive step');
          }
          const employeeId = requestDoc.employee_id ? String(requestDoc.employee_id) : null;
          if (!employeeId) throw createHttpError(400, 'Return request employee is missing');
          const employee = await EmployeeModel.findById(employeeId, {
            first_name: 1,
            last_name: 1,
            email: 1,
          })
            .session(session!)
            .lean();
          if (!employee) throw createHttpError(404, 'Employee not found');

          const office = await OfficeModel.findById(officeId, { name: 1 }).session(session!).lean();
          if (!office) throw createHttpError(404, 'Office not found');

          const lineAssetItemIds = uniqueIds(
            (Array.isArray(requestDoc.lines) ? requestDoc.lines : []).map((line: any) =>
              line?.asset_item_id ? String(line.asset_item_id) : null
            )
          );
          if (lineAssetItemIds.length === 0) {
            throw createHttpError(400, 'Return request has no lines');
          }

          const assetItems = await AssetItemModel.find(
            { _id: { $in: lineAssetItemIds } },
            { asset_id: 1, tag: 1, serial_number: 1 }
          )
            .session(session!)
            .lean();
          const assetIds = uniqueIds(assetItems.map((item) => (item.asset_id ? String(item.asset_id) : null)));
          const assets = assetIds.length
            ? await AssetModel.find({ _id: { $in: assetIds } }, { name: 1 }).session(session!).lean()
            : [];
          const assetNameById = new Map(assets.map((asset) => [String(asset._id), String(asset.name || '')]));
          const itemById = new Map(assetItems.map((item) => [String(item._id), item]));
          const lines = lineAssetItemIds.map((assetItemId) => {
            const item = itemById.get(assetItemId);
            return {
              assetItemId,
              assetName: item?.asset_id ? assetNameById.get(String(item.asset_id)) || 'Unknown Asset' : 'Unknown Asset',
              tag: String(item?.tag || ''),
              serialNumber: String(item?.serial_number || ''),
            };
          });

          const receipt = await generateAndStoreReturnReceipt({
            session: session!,
            officeId,
            officeName: String(office.name || 'Unknown Office'),
            employeeName: displayEmployeeName(employee),
            returnRequestId: requestDoc.id,
            recordId: String(requestDoc.record_id),
            createdByUserId: ctx.userId,
            lines,
          });
          requestDoc.receipt_document_id = receipt.document._id as any;
          await requestDoc.save({ session: session! });
          receiptDocumentId = receipt.document.id;

          await logAudit({
            ctx,
            action: 'RETURN_REQUEST_RECEIPT_GENERATE',
            entityType: 'ReturnRequest',
            entityId: requestDoc.id,
            officeId,
            diff: {
              documentId: receipt.document.id,
              documentVersionId: receipt.version.id,
            },
            session: session!,
          });
        });
      }

      if (!receiptDocumentId) {
        throw createHttpError(500, 'Failed to resolve return receipt document');
      }

      const [document, version] = await Promise.all([
        DocumentModel.findById(receiptDocumentId, { office_id: 1, doc_type: 1, status: 1 }).lean(),
        DocumentVersionModel.findOne({ document_id: receiptDocumentId })
          .sort({ version_no: -1 })
          .lean(),
      ]);
      if (!document) throw createHttpError(404, 'Return receipt document not found');
      if (!version) throw createHttpError(404, 'Return receipt file not found');
      if (!ctx.isHeadoffice && !isOwnerEmployee && String(document.office_id || '') !== ctx.locationId) {
        throw createHttpError(403, 'Access restricted to assigned office');
      }

      const storageKey = String(version.storage_key || version.file_path || '');
      if (!storageKey) throw createHttpError(404, 'Return receipt file path is missing');
      const uploadsRoot = path.resolve(process.cwd(), 'uploads');
      const absolutePath = path.resolve(process.cwd(), storageKey);
      if (!absolutePath.startsWith(uploadsRoot)) {
        throw createHttpError(400, 'Invalid return receipt file path');
      }
      await fs.access(absolutePath);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Content-Disposition', `inline; filename="return-receipt-${returnRequest.id}.pdf"`);
      return res.sendFile(absolutePath);
    } catch (error) {
      return next(error);
    } finally {
      if (session) session.endSession();
    }
  },
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
