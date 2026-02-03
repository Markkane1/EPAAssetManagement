import api from '@/lib/api';

export type DocumentType =
  | 'IssueSlip'
  | 'ReturnSlip'
  | 'TransferChallan'
  | 'MaintenanceJobCard'
  | 'Warranty'
  | 'Invoice'
  | 'DisposalApproval'
  | 'IncidentReport'
  | 'Other';

export type DocumentStatus = 'Draft' | 'Final' | 'Archived';

export interface DocumentCreateDto {
  title: string;
  docType: DocumentType;
  status?: DocumentStatus;
  officeId?: string;
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  version_no: number;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  file_url?: string | null;
  uploaded_at: string;
}

export interface DocumentRecord {
  id: string;
  title: string;
  doc_type: DocumentType;
  status: DocumentStatus;
  office_id: string;
  created_at: string;
}

export const documentService = {
  create: (data: DocumentCreateDto) => api.post<DocumentRecord>('/documents', data),
  list: (params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params).toString()}` : '';
    return api.get<DocumentRecord[]>(`/documents${query}`);
  },
  getById: (id: string) => api.get<DocumentRecord>(`/documents/${id}`),
  upload: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.upload<DocumentVersion>(`/documents/${id}/upload`, form);
  },
};

export default documentService;
