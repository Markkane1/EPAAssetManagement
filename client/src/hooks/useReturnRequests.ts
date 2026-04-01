import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { API_CONFIG } from '@/config/api.config';
import { returnRequestService } from '@/services/returnRequestService';
import type { ReturnRequestListParams } from '@/services/returnRequestService';
import { refreshActiveQueries } from '@/lib/queryRefresh';

const { queryKeys, query } = API_CONFIG;
const { heavyList, detail } = query.profiles;

type QueryToggleOptions = {
  enabled?: boolean;
};

export const useReturnRequests = (params?: ReturnRequestListParams, options: QueryToggleOptions = {}) => {
  const { enabled = true } = options;
  return useQuery({
    queryKey: [
      ...queryKeys.returnRequests,
      'list',
      params?.status || 'all',
      params?.employeeId || 'all',
      params?.officeId || 'all',
      params?.from || '',
      params?.to || '',
      params?.page ?? 1,
      params?.limit ?? null,
    ],
    queryFn: () => returnRequestService.list(params),
    staleTime: heavyList.staleTime,
    refetchOnWindowFocus: heavyList.refetchOnWindowFocus,
    enabled,
  });
};

export const useReturnRequestDetail = (id: string, options: QueryToggleOptions = {}) => {
  const { enabled = true } = options;
  return useQuery({
    queryKey: [...queryKeys.returnRequests, 'detail', id],
    queryFn: () => returnRequestService.getById(id),
    staleTime: detail.staleTime,
    refetchOnWindowFocus: detail.refetchOnWindowFocus,
    enabled: enabled && !!id,
  });
};

export const useReceiveReturnRequest = (id: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => returnRequestService.receive(id),
    onSuccess: async () => {
      await refreshActiveQueries(queryClient, [
        queryKeys.returnRequests,
        queryKeys.assignments,
        queryKeys.assetItems,
      ]);
      toast.success('Return request received.');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to receive return request.');
    },
  });
};

export const useUploadSignedReturnRequest = (id: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) => returnRequestService.uploadSignedReturn(id, formData),
    onSuccess: async () => {
      await refreshActiveQueries(queryClient, [queryKeys.returnRequests]);
      toast.success('Signed return receipt uploaded.');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to upload signed return receipt.');
    },
  });
};

export const useCreateReturnRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: returnRequestService.create,
    onSuccess: async () => {
      await refreshActiveQueries(queryClient, [queryKeys.returnRequests]);
      toast.success('Return request submitted.');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to submit return request.');
    },
  });
};
