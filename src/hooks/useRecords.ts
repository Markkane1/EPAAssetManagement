import { useQuery } from '@tanstack/react-query';
import { recordService } from '@/services/recordService';
import type { RecordEntry, RecordDetailResponse } from '@/types';

export interface RecordLookupParams {
  recordType?: string;
  assetItemId?: string;
  employeeId?: string;
  assignmentId?: string;
  transferId?: string;
  maintenanceRecordId?: string;
  referenceNo?: string;
}

export const useRecordLookup = (params: RecordLookupParams | null, enabled = true) => {
  return useQuery({
    queryKey: ['records', 'lookup', params],
    queryFn: () => recordService.list(params || undefined),
    enabled: enabled && Boolean(params),
    select: (records: RecordEntry[]) => (records.length > 0 ? records[0] : null),
    staleTime: 60_000,
  });
};

export const useRecordDetail = (recordId?: string | null, enabled = true) => {
  return useQuery<RecordDetailResponse>({
    queryKey: ['records', 'detail', recordId],
    queryFn: () => recordService.getDetail(recordId || ''),
    enabled: enabled && Boolean(recordId),
    staleTime: 30_000,
  });
};
