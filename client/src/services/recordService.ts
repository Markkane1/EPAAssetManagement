import api from '@/lib/api';
import type { RecordDetailResponse, RecordEntry } from '@/types';

const LIST_LIMIT = 2000;

export interface RecordListParams {
  recordType?: string;
  status?: string;
  officeId?: string;
  from?: string;
  to?: string;
  assetItemId?: string;
  employeeId?: string;
  assignmentId?: string;
  transferId?: string;
  maintenanceRecordId?: string;
  referenceNo?: string;
  page?: number;
  limit?: number;
}

export const recordService = {
  list: (params?: RecordListParams) => {
    const queryParams = params
      ? Object.entries(params).reduce<Record<string, string>>((acc, [key, value]) => {
          if (value !== undefined && value !== null && value !== '') {
            acc[key] = String(value);
          }
          return acc;
        }, {})
      : null;
    if (queryParams && !queryParams.limit) {
      queryParams.limit = String(LIST_LIMIT);
    }
    const query = queryParams ? `?${new URLSearchParams(queryParams).toString()}` : `?limit=${LIST_LIMIT}`;
    return api.get<RecordEntry[]>(`/records${query}`);
  },
  getDetail: (id: string) => api.get<RecordDetailResponse>(`/records/${id}/detail`),
};

export default recordService;
