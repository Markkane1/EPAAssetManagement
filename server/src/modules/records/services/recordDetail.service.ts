import { RecordModel } from '../../../models/record.model';
import { DocumentLinkModel } from '../../../models/documentLink.model';
import { DocumentModel } from '../../../models/document.model';
import { DocumentVersionModel } from '../../../models/documentVersion.model';
import { ApprovalRequestModel } from '../../../models/approvalRequest.model';
import { AuditLogModel } from '../../../models/auditLog.model';
import { createHttpError } from '../../../utils/httpError';
import { RequestContext } from '../../../utils/scope';
import { REQUIRED_DOCUMENTS, APPROVAL_REQUIRED } from '../utils/transitions';

export async function getRecordDetail(ctx: RequestContext, recordId: string) {
  const record = await RecordModel.findById(recordId);
  if (!record) throw createHttpError(404, 'Record not found');
  const recordDoc = record as any;

  if (!ctx.isOrgAdmin && recordDoc.office_id.toString() !== ctx.locationId) {
    throw createHttpError(403, 'Access restricted to assigned office');
  }

  const relatedMaintenanceId = recordDoc.maintenance_record_id
    ? recordDoc.maintenance_record_id.toString()
    : null;

  const linkFilters: Array<{ entity_type: string; entity_id: string }> = [
    { entity_type: 'Record', entity_id: recordDoc.id },
  ];
  if (relatedMaintenanceId) {
    linkFilters.push({ entity_type: 'MaintenanceRecord', entity_id: relatedMaintenanceId });
  }

  const documentViews = await DocumentLinkModel.aggregate([
    { $match: { $or: linkFilters } },
    { $sort: { created_at: -1 } },
    {
      $lookup: {
        from: DocumentModel.collection.name,
        localField: 'document_id',
        foreignField: '_id',
        as: 'document',
      },
    },
    {
      $set: {
        document: { $ifNull: [{ $arrayElemAt: ['$document', 0] }, null] },
      },
    },
    {
      $lookup: {
        from: DocumentVersionModel.collection.name,
        let: { documentId: '$document_id' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$document_id', '$$documentId'] },
            },
          },
          { $sort: { version_no: -1 } },
        ],
        as: 'versions',
      },
    },
    {
      $group: {
        _id: '$document_id',
        document: { $first: '$document' },
        versions: { $first: '$versions' },
        links: {
          $push: {
            _id: '$_id',
            document_id: '$document_id',
            entity_type: '$entity_type',
            entity_id: '$entity_id',
            required_for_status: '$required_for_status',
            created_at: '$created_at',
            updated_at: '$updated_at',
          },
        },
      },
    },
    { $sort: { 'document.created_at': -1 } },
  ]).exec();

  const approvals = await ApprovalRequestModel.find({ record_id: recordDoc.id }).sort({ requested_at: -1 });
  const auditLogs = await AuditLogModel.find({
    entity_type: 'Record',
    entity_id: recordDoc.id,
  })
    .sort({ timestamp: -1 })
    .select({ _id: 1, actor_user_id: 1, office_id: 1, action: 1, entity_type: 1, entity_id: 1, timestamp: 1, diff: 1 });

  const docTypesWithVersions = new Set<string>();
  documentViews.forEach((view) => {
    const doc = view.document as any;
    if (!doc) return;
    if ((view.versions || []).length === 0) return;
    if (doc.doc_type) docTypesWithVersions.add(String(doc.doc_type));
  });

  const missingSet = new Set<string>();
  const requiredByStatus = REQUIRED_DOCUMENTS[String(recordDoc.record_type)] || {};
  Object.values(requiredByStatus).forEach((groups) => {
    groups.forEach((group) => {
      const hasDoc = group.some((type) => docTypesWithVersions.has(type));
      if (!hasDoc) {
        if (group.length === 1) {
          missingSet.add(`${group[0]} missing`);
        } else {
          missingSet.add(`${group.join(' or ')} missing`);
        }
      }
    });
  });

  const approvalRequired = (APPROVAL_REQUIRED[String(recordDoc.record_type)] || []).length > 0;
  const approved = approvals.some((approval) => approval.status === 'Approved');
  if (approvalRequired && !approved) {
    missingSet.add('Approval required');
  }

  return {
    record: recordDoc,
    documents: documentViews,
    approvals,
    auditLogs,
    missingRequirements: Array.from(missingSet),
  };
}

