import api from '@/lib/api';

export type DocumentLinkEntityType = 'Record' | 'AssetItem' | 'Assignment' | 'Transfer' | 'MaintenanceRecord';

export interface DocumentLinkCreateDto {
  documentId: string;
  entityType: DocumentLinkEntityType;
  entityId: string;
  requiredForStatus?: 'PendingApproval' | 'Approved' | 'Completed';
}

export interface DocumentLinkRecord {
  id: string;
  document_id: string;
  entity_type: DocumentLinkEntityType;
  entity_id: string;
  required_for_status?: string | null;
}

export const documentLinkService = {
  create: (data: DocumentLinkCreateDto) => api.post<DocumentLinkRecord>('/document-links', data),
};

export default documentLinkService;
