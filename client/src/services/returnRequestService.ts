import api from '@/lib/api';
import type { DocumentVersion, ReturnRequest, ReturnRequestLine } from '@/types';

function toQueryString(params?: Record<string, unknown>) {
  if (!params) return '';
  const query = Object.entries(params).reduce<Record<string, string>>((acc, [key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      acc[key] = String(value);
    }
    return acc;
  }, {});
  const encoded = new URLSearchParams(query).toString();
  return encoded ? `?${encoded}` : '';
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
}

export interface ReturnRequestListParams {
  officeId?: string;
  status?: string;
  employeeId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface ReturnRequestCreatePayload {
  employeeId?: string;
  officeId?: string;
  returnAll?: boolean;
  assetItemIds?: string[];
}

export interface ReturnRequestDocumentSummary {
  id: string;
  title: string;
  doc_type: string;
  status: string;
  created_at: string;
  latestVersion: DocumentVersion | null;
  links: Array<{
    entity_type: string;
    entity_id: string;
    required_for_status: string | null;
  }>;
}

export interface ReturnRequestDetailResponse {
  returnRequest: ReturnRequest;
  lines: ReturnRequestLine[];
  documents: {
    receiptDocument: ReturnRequestDocumentSummary | null;
    linked: ReturnRequestDocumentSummary[];
  };
}

export const returnRequestService = {
  list: (params?: ReturnRequestListParams) =>
    api.get<PaginatedResponse<ReturnRequest>>(`/return-requests${toQueryString(params)}`),
  getById: (id: string) => api.get<ReturnRequestDetailResponse>(`/return-requests/${id}`),
  create: (payload: ReturnRequestCreatePayload) => api.post<ReturnRequest>('/return-requests', payload),
  receive: (id: string) =>
    api.post<{
      returnRequest: ReturnRequest;
      record: unknown;
      receiptDocument: unknown;
      receiptVersion: unknown;
      closedAssignmentIds: string[];
    }>(`/return-requests/${id}/receive`, {}),
  downloadReturnReceiptPdf: (id: string) => api.download(`/return-requests/${id}/return-receipt.pdf`),
  uploadSignedReturn: (id: string, formData: FormData) =>
    api.upload<{ returnRequest: ReturnRequest; record: unknown; document: unknown; documentVersion: unknown }>(
      `/return-requests/${id}/upload-signed-return`,
      formData
    ),
};

export default returnRequestService;
