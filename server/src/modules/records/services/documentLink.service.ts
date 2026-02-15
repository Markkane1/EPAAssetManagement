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

async function resolveEntityOffice(entityType: DocumentLinkInput['entityType'], entityId: string) {
  switch (entityType) {
    case 'Record': {
      const record = await RecordModel.findById(entityId);
      return record?.office_id?.toString() || null;
    }
    case 'AssetItem': {
      const item = await AssetItemModel.findById(entityId);
      return item ? getAssetItemOfficeId(item) : null;
    }
    case 'Assignment': {
      const assignment = await AssignmentModel.findById(entityId);
      if (!assignment) return null;
      const item = await AssetItemModel.findById(assignment.asset_item_id);
      return item ? getAssetItemOfficeId(item) : null;
    }
    case 'Transfer': {
      const transfer = await TransferModel.findById(entityId);
      return transfer?.from_office_id?.toString() || transfer?.to_office_id?.toString() || null;
    }
    case 'MaintenanceRecord': {
      const record = await MaintenanceRecordModel.findById(entityId);
      if (!record) return null;
      const item = await AssetItemModel.findById(record.asset_item_id);
      return item ? getAssetItemOfficeId(item) : null;
    }
    case 'Requisition': {
      const requisition = await RequisitionModel.findById(entityId);
      return requisition?.office_id?.toString() || null;
    }
    default:
      return null;
  }
}

export async function createDocumentLink(ctx: RequestContext, input: DocumentLinkInput) {
  const document = await DocumentModel.findById(input.documentId);
  if (!document) throw createHttpError(404, 'Document not found');

  const entityOfficeId = await resolveEntityOffice(input.entityType, input.entityId);
  if (!ctx.isHeadoffice) {
    if (!ctx.locationId) throw createHttpError(403, 'User is not assigned to an office');
    if (document.office_id.toString() !== ctx.locationId) {
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
    officeId: document.office_id.toString(),
    diff: { documentId: input.documentId },
  });

  return link;
}
