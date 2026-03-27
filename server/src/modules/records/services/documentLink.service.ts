import mongoose from 'mongoose';
import { DocumentLinkModel } from '../../../models/documentLink.model';
import { DocumentModel } from '../../../models/document.model';
import { RecordModel } from '../../../models/record.model';
import { AssetItemModel } from '../../../models/assetItem.model';
import { AssignmentModel } from '../../../models/assignment.model';
import { TransferModel } from '../../../models/transfer.model';
import { MaintenanceRecordModel } from '../../../models/maintenanceRecord.model';
import { RequisitionModel } from '../../../models/requisition.model';
import { createHttpError } from '../../../utils/httpError';
import { RequestContext } from '../../../utils/scope';
import { logAudit } from './audit.service';
import { getAssetItemOfficeId } from '../../../utils/assetHolder';

export interface DocumentLinkInput {
  documentId: string;
  entityType: 'Record' | 'AssetItem' | 'Assignment' | 'Transfer' | 'MaintenanceRecord' | 'Requisition';
  entityId: string;
  requiredForStatus?: 'PendingApproval' | 'Approved' | 'Completed';
}

type AssetItemHolderDoc = {
  holder_type?: unknown;
  holder_id?: unknown;
};

type OfficeScopedDoc = {
  office_id?: unknown;
};

type TransferOfficeDoc = {
  from_office_id?: unknown;
  to_office_id?: unknown;
};

function firstDoc<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

async function resolveAssetItemOfficeFromQuery(query: Record<string, unknown>) {
  const item = firstDoc(
    (await AssetItemModel.findOne(query, { holder_type: 1, holder_id: 1 }).lean().exec()) as
      | AssetItemHolderDoc
      | AssetItemHolderDoc[]
      | null
  );
  return item ? getAssetItemOfficeId(item) : null;
}

function toObjectIdOrNull(value: string) {
  return mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null;
}

async function resolveEntityOffice(entityType: DocumentLinkInput['entityType'], entityId: string) {
  switch (entityType) {
    case 'Record': {
      const record = firstDoc(
        (await RecordModel.findById(entityId, { office_id: 1 }).lean().exec()) as
          | OfficeScopedDoc
          | OfficeScopedDoc[]
          | null
      );
      return record?.office_id ? String(record.office_id) : null;
    }
    case 'AssetItem': {
      return resolveAssetItemOfficeFromQuery({ _id: entityId });
    }
    case 'Assignment': {
      const assignmentId = toObjectIdOrNull(entityId);
      if (!assignmentId) return null;
      const [assignment] = await AssignmentModel.aggregate<{ assetItem?: AssetItemHolderDoc }>([
        { $match: { _id: assignmentId } },
        {
          $lookup: {
            from: AssetItemModel.collection.name,
            localField: 'asset_item_id',
            foreignField: '_id',
            pipeline: [{ $project: { holder_type: 1, holder_id: 1 } }],
            as: 'assetItem',
          },
        },
        {
          $project: {
            assetItem: { $arrayElemAt: ['$assetItem', 0] },
          },
        },
      ]);
      return assignment?.assetItem ? getAssetItemOfficeId(assignment.assetItem) : null;
    }
    case 'Transfer': {
      const transfer = firstDoc(
        (await TransferModel.findById(entityId, { from_office_id: 1, to_office_id: 1 }).lean().exec()) as
          | TransferOfficeDoc
          | TransferOfficeDoc[]
          | null
      );
      return (transfer?.from_office_id ? String(transfer.from_office_id) : null) || (transfer?.to_office_id ? String(transfer.to_office_id) : null);
    }
    case 'MaintenanceRecord': {
      const maintenanceRecordId = toObjectIdOrNull(entityId);
      if (!maintenanceRecordId) return null;
      const [record] = await MaintenanceRecordModel.aggregate<{ assetItem?: AssetItemHolderDoc }>([
        { $match: { _id: maintenanceRecordId } },
        {
          $lookup: {
            from: AssetItemModel.collection.name,
            localField: 'asset_item_id',
            foreignField: '_id',
            pipeline: [{ $project: { holder_type: 1, holder_id: 1 } }],
            as: 'assetItem',
          },
        },
        {
          $project: {
            assetItem: { $arrayElemAt: ['$assetItem', 0] },
          },
        },
      ]);
      return record?.assetItem ? getAssetItemOfficeId(record.assetItem) : null;
    }
    case 'Requisition': {
      const requisition = firstDoc(
        (await RequisitionModel.findById(entityId, { office_id: 1 }).lean().exec()) as
          | OfficeScopedDoc
          | OfficeScopedDoc[]
          | null
      );
      return requisition?.office_id ? String(requisition.office_id) : null;
    }
    default:
      return null;
  }
}

export async function createDocumentLink(ctx: RequestContext, input: DocumentLinkInput) {
  const document = firstDoc(
    (await DocumentModel.findById(input.documentId, { office_id: 1 }).lean().exec()) as
      | OfficeScopedDoc
      | OfficeScopedDoc[]
      | null
  );
  if (!document) throw createHttpError(404, 'Document not found');

  const documentOfficeId = document.office_id ? String(document.office_id) : null;
  if (!documentOfficeId) throw createHttpError(400, 'Document office is missing');

  const entityOfficeId = await resolveEntityOffice(input.entityType, input.entityId);
  if (!ctx.isOrgAdmin) {
    if (!ctx.locationId) throw createHttpError(403, 'User is not assigned to an office');
    if (documentOfficeId !== ctx.locationId) {
      throw createHttpError(403, 'Document must belong to your office');
    }
    if (entityOfficeId && entityOfficeId !== ctx.locationId) {
      throw createHttpError(403, 'Entity must belong to your office');
    }
  }

  const link = await DocumentLinkModel.create({
    document_id: input.documentId,
    entity_type: input.entityType,
    entity_id: input.entityId,
    required_for_status: input.requiredForStatus || null,
  });

  await logAudit({
    ctx,
    action: 'LINK_DOCUMENT',
    entityType: input.entityType,
    entityId: input.entityId,
    officeId: documentOfficeId,
    diff: { documentId: input.documentId },
  });

  return link;
}

