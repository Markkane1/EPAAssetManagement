import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { API_CONFIG } from '@/config/api.config';
import { requisitionService } from '@/services/requisitionService';
import type {
  RequisitionFulfillPayload,
  RequisitionLineMapPayload,
  RequisitionListParams,
  RequisitionVerifyPayload,
} from '@/services/requisitionService';
import { assignmentService } from '@/services/assignmentService';
import { refreshActiveQueries } from '@/lib/queryRefresh';

const { queryKeys, query } = API_CONFIG;
const { heavyList, detail } = query.profiles;

type QueryToggleOptions = {
  enabled?: boolean;
};

export const useRequisitions = (params?: RequisitionListParams, options: QueryToggleOptions = {}) => {
  const { enabled = true } = options;
  return useQuery({
    queryKey: [
      ...queryKeys.requisitions,
      'list',
      params?.queue || 'all',
      params?.status || 'all',
      params?.fileNumber || '',
      params?.from || '',
      params?.to || '',
      params?.page ?? 1,
      params?.limit ?? null,
    ],
    queryFn: () => requisitionService.list(params),
    staleTime: heavyList.staleTime,
    refetchOnWindowFocus: heavyList.refetchOnWindowFocus,
    enabled,
  });
};

export const useRequisitionDetail = (id: string, options: QueryToggleOptions = {}) => {
  const { enabled = true } = options;
  return useQuery({
    queryKey: [...queryKeys.requisitions, 'detail', id],
    queryFn: () => requisitionService.getById(id),
    staleTime: detail.staleTime,
    refetchOnWindowFocus: detail.refetchOnWindowFocus,
    enabled: enabled && !!id,
  });
};

export const useRequisitionAssignments = (requisitionId: string, options: QueryToggleOptions = {}) => {
  const { enabled = true } = options;
  return useQuery({
    queryKey: [...queryKeys.assignments, 'requisition', requisitionId],
    queryFn: () => assignmentService.getAll(),
    staleTime: detail.staleTime,
    refetchOnWindowFocus: detail.refetchOnWindowFocus,
    enabled: enabled && !!requisitionId,
    select: (assignments) =>
      assignments.filter(
        (assignment) => String(assignment.requisition_id || '') === String(requisitionId)
      ),
  });
};

export const useVerifyRequisition = (id: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RequisitionVerifyPayload) => requisitionService.verify(id, payload),
    onSuccess: async () => {
      await refreshActiveQueries(queryClient, [queryKeys.requisitions]);
      toast.success('Requisition updated.');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update requisition.');
    },
  });
};

export const useMapRequisitionLine = (requisitionId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      lineId,
      payload,
    }: {
      lineId: string;
      payload: RequisitionLineMapPayload;
    }) => requisitionService.mapLine(requisitionId, lineId, payload),
    onSuccess: async () => {
      await refreshActiveQueries(queryClient, [[...queryKeys.requisitions, 'detail', requisitionId]]);
      toast.success('Line mapped successfully.');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to map line.');
    },
  });
};

export const useFulfillRequisition = (requisitionId: string, issuingOfficeId?: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RequisitionFulfillPayload) => requisitionService.fulfill(requisitionId, payload),
    onSuccess: async () => {
      const queryFamilies: Array<readonly unknown[]> = [
        queryKeys.requisitions,
        queryKeys.assignments,
        [...queryKeys.assignments, 'requisition', requisitionId],
        queryKeys.assetItems,
        queryKeys.consumableBalances,
        queryKeys.consumableLedger,
        queryKeys.consumableRollup,
        queryKeys.consumableExpiry,
      ];
      if (issuingOfficeId) {
        queryFamilies.push([...queryKeys.assetItems, 'byLocation', issuingOfficeId]);
      }
      await refreshActiveQueries(queryClient, queryFamilies);
      toast.success('Fulfillment submitted.');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to fulfill requisition.');
    },
  });
};
