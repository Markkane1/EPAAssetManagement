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

  const links = await DocumentLinkModel.find({ $or: linkFilters }).sort({ created_at: -1 });
  const docIds = Array.from(new Set(links.map((link) => link.document_id.toString())));
  const documents = docIds.length
    ? await DocumentModel.find({ _id: { $in: docIds } }).sort({ created_at: -1 })
    : [];
  const versions = docIds.length
    ? await DocumentVersionModel.find({ document_id: { $in: docIds } }).sort({ version_no: -1 })
    : [];

  const docMap = new Map(documents.map((doc) => [doc.id.toString(), doc]));
  const versionMap = new Map<string, any[]>();
  versions.forEach((version) => {
    const key = version.document_id.toString();
    const list = versionMap.get(key) || [];
    list.push(version);
    versionMap.set(key, list);
  });
  const linkMap = new Map<string, any[]>();
  links.forEach((link) => {
    const key = link.document_id.toString();
    const list = linkMap.get(key) || [];
    list.push(link);
    linkMap.set(key, list);
  });

  const documentViews = docIds.map((docId) => {
    const doc = docMap.get(docId);
    const docVersions = versionMap.get(docId) || [];
    const docLinks = linkMap.get(docId) || [];
    return {
      document: doc,
      versions: docVersions,
      links: docLinks,
    };
  });

  const approvals = await ApprovalRequestModel.find({ record_id: recordDoc.id }).sort({ requested_at: -1 });
  const auditLogs = await AuditLogModel.find({
    entity_type: 'Record',
    entity_id: recordDoc.id,
  }).sort({ timestamp: -1 });

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

