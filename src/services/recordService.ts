import api from '@/lib/api';
import type { RecordDetailResponse, RecordEntry } from '@/types';

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
    const query = queryParams ? `?${new URLSearchParams(queryParams).toString()}` : '';
    return api.get<RecordEntry[]>(`/records${query}`);
  },
  getDetail: (id: string) => api.get<RecordDetailResponse>(`/records/${id}/detail`),
};

export default recordService;
