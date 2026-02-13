import api from '@/lib/api';
import type { DocumentVersion, Requisition, RequisitionLine } from '@/types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

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

async function downloadPdf(endpoint: string): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'GET',
    credentials: 'include',
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP error! status: ${response.status}`);
  }
  return response.blob();
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
}

export interface RequisitionListParams {
  officeId?: string;
  status?: string;
  fileNumber?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface RequisitionCreateLineInput {
  lineType: 'MOVEABLE' | 'CONSUMABLE';
  requestedName: string;
  requestedQuantity?: number;
  approvedQuantity?: number;
  notes?: string;
}

export interface RequisitionCreateFormInput {
  fileNumber: string;
  officeId: string;
  requestedByEmployeeId?: string;
  remarks?: string;
  lines: RequisitionCreateLineInput[];
  requisitionFile: File;
}

export interface RequisitionVerifyPayload {
  decision: 'VERIFY' | 'REJECT';
  remarks?: string;
}

export interface RequisitionFulfillLinePayload {
  lineId: string;
  assignedAssetItemIds?: string[];
  issuedQuantity?: number;
}

export interface RequisitionFulfillPayload {
  lines: RequisitionFulfillLinePayload[];
}

export interface RequisitionAdjustPayload {
  adjustments: unknown[];
  reason: string;
}

export interface RequisitionDocumentSummary {
  id: string;
  title: string;
  doc_type: string;
  status: string;
  created_at: string;
  latestVersion: DocumentVersion | null;
}

export interface RequisitionDetailResponse {
  requisition: Requisition;
  lines: RequisitionLine[];
  documents: {
    requisitionForm: RequisitionDocumentSummary | null;
    issueSlip: RequisitionDocumentSummary | null;
  };
}

export interface RequisitionCreateResponse {
  requisition: Requisition;
  lines: RequisitionLine[];
}

export const requisitionService = {
  list: (params?: RequisitionListParams) =>
    api.get<PaginatedResponse<Requisition>>(`/requisitions${toQueryString(params)}`),
  getById: (id: string) => api.get<RequisitionDetailResponse>(`/requisitions/${id}`),
  create: (input: RequisitionCreateFormInput) => {
    const form = new FormData();
    form.append('fileNumber', input.fileNumber);
    form.append('officeId', input.officeId);
    if (input.requestedByEmployeeId) form.append('requestedByEmployeeId', input.requestedByEmployeeId);
    if (input.remarks) form.append('remarks', input.remarks);
    form.append('lines', JSON.stringify(input.lines));
    form.append('requisitionFile', input.requisitionFile);
    return api.upload<RequisitionCreateResponse>('/requisitions', form);
  },
  verify: (id: string, payload: RequisitionVerifyPayload) =>
    api.post<Requisition>(`/requisitions/${id}/verify`, payload),
  fulfill: (id: string, payload: RequisitionFulfillPayload) =>
    api.post<{ requisition: Requisition; lines: RequisitionLine[]; assignments: unknown[]; consumableTransactions: unknown[] }>(
      `/requisitions/${id}/fulfill`,
      payload
    ),
  downloadIssuanceReportPdf: (id: string) => downloadPdf(`/requisitions/${id}/issuance-report.pdf`),
  uploadSignedIssuance: (id: string, formData: FormData) =>
    api.upload<{ requisition: Requisition; record: unknown; document: unknown; documentVersion: unknown }>(
      `/requisitions/${id}/upload-signed-issuance`,
      formData
    ),
  adjust: (id: string, payload: RequisitionAdjustPayload) =>
    api.post<{ requisition: Requisition; previousRecord: unknown; newRecord: unknown; archivedIssueSlipDocumentIds: string[] }>(
      `/requisitions/${id}/adjust`,
      payload
    ),
};

export default requisitionService;
