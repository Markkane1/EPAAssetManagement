import api from '@/lib/api';
import type { DocumentVersion, Requisition, RequisitionLine } from '@/types';

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
  line_type: 'MOVEABLE' | 'CONSUMABLE';
  requested_name: string;
  requested_quantity?: number;
  approved_quantity?: number;
  asset_id?: string;
  consumable_id?: string;
  notes?: string;
}

export interface RequisitionCreateFormInput {
  file_number: string;
  office_id: string;
  target_type: 'EMPLOYEE' | 'SUB_LOCATION';
  target_id: string;
  remarks?: string;
  lines: RequisitionCreateLineInput[];
  requisition_file: File;
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

export interface RequisitionLineMapPayload {
  map_type: 'MOVEABLE' | 'CONSUMABLE';
  asset_id?: string;
  consumable_id?: string;
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
    form.append('fileNumber', input.file_number);
    form.append('officeId', input.office_id);
    form.append('target_type', input.target_type);
    form.append('target_id', input.target_id);
    if (input.remarks) form.append('remarks', input.remarks);
    form.append('lines', JSON.stringify(input.lines));
    form.append('requisitionFile', input.requisition_file);
    return api.upload<RequisitionCreateResponse>('/requisitions', form);
  },
  mapLine: (requisitionId: string, lineId: string, payload: RequisitionLineMapPayload) =>
    api.post<{ requisition: Requisition; line: RequisitionLine }>(
      `/requisitions/${requisitionId}/lines/${lineId}/map`,
      payload
    ),
  verify: (id: string, payload: RequisitionVerifyPayload) =>
    api.post<Requisition>(`/requisitions/${id}/verify`, payload),
  fulfill: (id: string, payload: RequisitionFulfillPayload) =>
    api.post<{ requisition: Requisition; lines: RequisitionLine[]; assignments: unknown[]; consumableTransactions: unknown[] }>(
      `/requisitions/${id}/fulfill`,
      payload
    ),
  downloadIssuanceReportPdf: (id: string) => api.download(`/requisitions/${id}/issuance-report.pdf`),
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
