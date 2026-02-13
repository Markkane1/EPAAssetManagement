import api from '@/lib/api';

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

export interface NonComplianceReportParams {
  officeId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface NonComplianceReportResponse {
  page: number;
  limit: number;
  total: number;
  officeId: string | null;
  counts: {
    requisitionsWithoutSignedIssueSlip: number;
    returnRequestsWithoutSignedReturnSlip: number;
    total: number;
  };
  items: Array<{
    type: 'REQUISITION' | 'RETURN_REQUEST';
    issue: 'MISSING_SIGNED_ISSUE_SLIP' | 'MISSING_SIGNED_RETURN_SLIP';
    id: string;
    office_id: string;
    status: string;
    file_number?: string;
    signed_document_id: string | null;
    created_at: string;
    updated_at: string;
  }>;
}

export const reportService = {
  getNonCompliance: (params?: NonComplianceReportParams) =>
    api.get<NonComplianceReportResponse>(`/reports/noncompliance${toQueryString(params)}`),
};

export default reportService;
