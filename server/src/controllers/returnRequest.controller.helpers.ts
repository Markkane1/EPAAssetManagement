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
import { officeAssetItemFilter } from '../utils/assetHolder';
import { asNullableString, parseBoolean, parseDateInput, parsePositiveInt, readParam } from '../utils/requestParsing';

const RECEIVE_ALLOWED_STATUSES = new Set(['SUBMITTED', 'RECEIVED_CONFIRMED']);

const SIGNED_UPLOAD_ALLOWED_STATUSES = new Set(['CLOSED_PENDING_SIGNATURE']);

type AuthRequestWithFiles = AuthRequest & {
  files?:
    | Express.Multer.File[]
    | {
        [fieldname: string]: Express.Multer.File[];
      };
};

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

export {
  RECEIVE_ALLOWED_STATUSES,
  SIGNED_UPLOAD_ALLOWED_STATUSES,
  AuthRequestWithFiles,
  asNullableString,
  parseBoolean,
  parseDateInput,
  parsePositiveInt,
  readParam,
  parseAssetItemIds,
  uniqueIds,
  displayEmployeeName,
  getSignedReturnFile,
};
