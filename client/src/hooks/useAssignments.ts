import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  assignmentService,
  AssignmentCreateDto,
  AssignmentListQuery,
  AssignmentUpdateDto,
} from '@/services/assignmentService';
import { toast } from 'sonner';
import { API_CONFIG } from '@/config/api.config';
import { refreshActiveQueries } from '@/lib/queryRefresh';

const { queryKeys, query } = API_CONFIG;
const { heavyList, detail } = query.profiles;

type QueryToggleOptions = {
  enabled?: boolean;
};

function isQueryToggleOptions(value: AssignmentListQuery | QueryToggleOptions) {
  return Boolean(value && typeof value === 'object' && 'enabled' in value && !('page' in value) && !('search' in value));
}

export const useAssignments = (
  queryOrOptions: AssignmentListQuery | QueryToggleOptions = {},
  options: QueryToggleOptions = {}
) => {
  const queryParams = isQueryToggleOptions(queryOrOptions) ? {} : queryOrOptions;
  const resolvedOptions = isQueryToggleOptions(queryOrOptions) ? queryOrOptions : options;
  const { enabled = true } = resolvedOptions;
  return useQuery({
    queryKey: [
      ...queryKeys.assignments,
      'list',
      queryParams.search?.trim() ?? '',
      queryParams.page ?? 'ALL_PAGES',
      queryParams.limit ?? 'ALL_LIMITS',
    ],
    queryFn: () => assignmentService.getAll(queryParams),
    staleTime: heavyList.staleTime,
    refetchOnWindowFocus: heavyList.refetchOnWindowFocus,
    enabled,
  });
};

export const usePagedAssignments = (query: AssignmentListQuery, options: QueryToggleOptions = {}) => {
  const { enabled = true } = options;
  return useQuery({
    queryKey: [...queryKeys.assignments, 'paged', query.page ?? 1, query.limit ?? null],
    queryFn: () => assignmentService.getPaged(query),
    staleTime: heavyList.staleTime,
    refetchOnWindowFocus: heavyList.refetchOnWindowFocus,
    enabled,
  });
};

export const useAssignment = (id: string) => {
  return useQuery({
    queryKey: [...queryKeys.assignments, id],
    queryFn: () => assignmentService.getById(id),
    enabled: !!id,
    staleTime: detail.staleTime,
    refetchOnWindowFocus: detail.refetchOnWindowFocus,
  });
};

export const useAssignmentsByEmployee = (employeeId: string) => {
  return useQuery({
    queryKey: [...queryKeys.assignments, 'byEmployee', employeeId],
    queryFn: () => assignmentService.getByEmployee(employeeId),
    enabled: !!employeeId,
    staleTime: heavyList.staleTime,
    refetchOnWindowFocus: heavyList.refetchOnWindowFocus,
  });
};

export const useAssignmentsByAssetItem = (assetItemId: string) => {
  return useQuery({
    queryKey: [...queryKeys.assignments, 'byAssetItem', assetItemId],
    queryFn: () => assignmentService.getByAssetItem(assetItemId),
    enabled: !!assetItemId,
    staleTime: heavyList.staleTime,
    refetchOnWindowFocus: heavyList.refetchOnWindowFocus,
  });
};

export const useCreateAssignment = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: AssignmentCreateDto) => assignmentService.create(data),
    onSuccess: async () => {
      await refreshActiveQueries(queryClient, [queryKeys.assignments, queryKeys.assetItems]);
      toast.success('Assignment created successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create assignment: ${error.message}`);
    },
  });
};

export const useUpdateAssignment = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AssignmentUpdateDto }) =>
      assignmentService.update(id, data),
    onSuccess: async () => {
      await refreshActiveQueries(queryClient, [queryKeys.assignments]);
      toast.success('Assignment updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update assignment: ${error.message}`);
    },
  });
};

export const useRequestReturn = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id }: { id: string }) => assignmentService.requestReturn(id),
    onSuccess: async () => {
      await refreshActiveQueries(queryClient, [queryKeys.assignments]);
      toast.success('Return requested successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to request return: ${error.message}`);
    },
  });
};

export const useUploadSignedHandoverSlip = (options: { requisitionId?: string; officeId?: string } = {}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, formData }: { id: string; formData: FormData }) =>
      assignmentService.uploadSignedHandoverSlip(id, formData),
    onSuccess: async () => {
      const queryFamilies: Array<readonly unknown[]> = [queryKeys.assignments, queryKeys.assetItems];
      if (options.requisitionId) {
        queryFamilies.push(
          [...queryKeys.requisitions, 'detail', options.requisitionId],
          [...queryKeys.assignments, 'requisition', options.requisitionId]
        );
      }
      if (options.officeId) {
        queryFamilies.push([...queryKeys.assetItems, 'byLocation', options.officeId]);
      }
      await refreshActiveQueries(queryClient, queryFamilies);
      toast.success('Signed handover slip uploaded.');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to upload signed handover slip.');
    },
  });
};

export const useUploadSignedReturnSlip = (options: { requisitionId?: string; officeId?: string } = {}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, formData }: { id: string; formData: FormData }) =>
      assignmentService.uploadSignedReturnSlip(id, formData),
    onSuccess: async () => {
      const queryFamilies: Array<readonly unknown[]> = [queryKeys.assignments, queryKeys.assetItems];
      if (options.requisitionId) {
        queryFamilies.push(
          [...queryKeys.requisitions, 'detail', options.requisitionId],
          [...queryKeys.assignments, 'requisition', options.requisitionId]
        );
      }
      if (options.officeId) {
        queryFamilies.push([...queryKeys.assetItems, 'byLocation', options.officeId]);
      }
      await refreshActiveQueries(queryClient, queryFamilies);
      toast.success('Signed return slip uploaded.');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to upload signed return slip.');
    },
  });
};

export const useReassignAsset = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, newEmployeeId, notes }: { id: string; newEmployeeId: string; notes?: string }) =>
      assignmentService.reassign(id, newEmployeeId, notes),
    onSuccess: async () => {
      await refreshActiveQueries(queryClient, [queryKeys.assignments]);
      toast.success('Asset reassigned successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to reassign asset: ${error.message}`);
    },
  });
};

export const useDeleteAssignment = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => assignmentService.delete(id),
    onSuccess: async () => {
      await refreshActiveQueries(queryClient, [queryKeys.assignments]);
      toast.success('Assignment deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete assignment: ${error.message}`);
    },
  });
};

