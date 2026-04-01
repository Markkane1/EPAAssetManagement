import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { employeeService } from '@/services/employeeService';
import type {
  EmployeeCreateDto,
  EmployeeListQuery,
  EmployeeTransferDto,
  EmployeeUpdateDto,
} from '@/services/employeeService';
import { toast } from 'sonner';
import { API_CONFIG } from '@/config/api.config';
import type { Employee } from '@/types';
import {
  refreshActiveQueries,
  removeEntityFromQueryCaches,
  syncEntityInQueryCaches,
} from '@/lib/queryRefresh';

const { queryKeys, messages, query } = API_CONFIG;
const { heavyList, detail } = query.profiles;

type QueryToggleOptions = {
  enabled?: boolean;
};

function isQueryToggleOptions(value: EmployeeListQuery | QueryToggleOptions) {
  return Boolean(value && typeof value === 'object' && 'enabled' in value && !('page' in value) && !('search' in value));
}

export const useEmployees = (
  queryOrOptions: EmployeeListQuery | QueryToggleOptions = {},
  options: QueryToggleOptions = {}
) => {
  const queryParams = isQueryToggleOptions(queryOrOptions) ? {} : queryOrOptions;
  const resolvedOptions = isQueryToggleOptions(queryOrOptions) ? queryOrOptions : options;
  const { enabled = true } = resolvedOptions;
  return useQuery({
    queryKey: [
      ...queryKeys.employees,
      'list',
      queryParams.search?.trim() ?? '',
    ],
    queryFn: () => employeeService.getAll(queryParams),
    staleTime: heavyList.staleTime,
    refetchOnWindowFocus: heavyList.refetchOnWindowFocus,
    enabled,
  });
};

export const usePagedEmployees = (query: EmployeeListQuery) => {
  return useQuery({
    queryKey: [...queryKeys.employees, 'paged', query.page ?? 1, query.limit ?? null],
    queryFn: () => employeeService.getPaged(query),
    staleTime: heavyList.staleTime,
    refetchOnWindowFocus: heavyList.refetchOnWindowFocus,
  });
};

export const useEmployee = (id: string) => {
  return useQuery({
    queryKey: [...queryKeys.employees, id],
    queryFn: () => employeeService.getById(id),
    enabled: !!id,
    staleTime: detail.staleTime,
    refetchOnWindowFocus: detail.refetchOnWindowFocus,
  });
};

export const useEmployeesByDirectorate = (directorateId: string) => {
  return useQuery({
    queryKey: [...queryKeys.employees, 'byDirectorate', directorateId],
    queryFn: () => employeeService.getByDirectorate(directorateId),
    enabled: !!directorateId,
    staleTime: heavyList.staleTime,
    refetchOnWindowFocus: heavyList.refetchOnWindowFocus,
  });
};

function sortEmployees(items: Employee[]) {
  return [...items].sort((left, right) =>
    `${left.first_name || ''} ${left.last_name || ''}`.localeCompare(
      `${right.first_name || ''} ${right.last_name || ''}`
    )
  );
}

function syncEmployeeCaches(queryClient: ReturnType<typeof useQueryClient>, employee: Employee) {
  syncEntityInQueryCaches(queryClient, {
    queryKey: queryKeys.employees,
    entity: employee,
    matchesQuery: (queryKey, entity) => {
      if (queryKey[1] === 'byDirectorate') {
        return String(entity.directorate_id || '') === String(queryKey[2] || '');
      }
      return true;
    },
    getPageInfo: (queryKey) => (
      queryKey[1] === 'paged'
        ? {
            page: Number(queryKey[2] || 1),
            limit: queryKey[3] === null ? null : Number(queryKey[3] || 0) || null,
          }
        : null
    ),
    sortItems: sortEmployees,
  });
}

export const useCreateEmployee = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: EmployeeCreateDto) => employeeService.create(data),
    onSuccess: async (employee) => {
      syncEmployeeCaches(queryClient, employee);
      await refreshActiveQueries(queryClient, [queryKeys.employees]);
      toast.success(messages.employeeCreated);
    },
    onError: (error: Error) => {
      toast.error(`${messages.employeeError}: ${error.message}`);
    },
  });
};

export const useUpdateEmployee = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: EmployeeUpdateDto }) =>
      employeeService.update(id, data),
    onSuccess: async (employee) => {
      syncEmployeeCaches(queryClient, employee);
      await refreshActiveQueries(queryClient, [queryKeys.employees]);
      toast.success(messages.employeeUpdated);
    },
    onError: (error: Error) => {
      toast.error(`${messages.employeeError}: ${error.message}`);
    },
  });
};

export const useDeleteEmployee = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => employeeService.delete(id),
    onSuccess: async (_data, id) => {
      removeEntityFromQueryCaches(queryClient, queryKeys.employees, id);
      await refreshActiveQueries(queryClient, [queryKeys.employees]);
      toast.success(messages.employeeDeleted);
    },
    onError: (error: Error) => {
      toast.error(`${messages.employeeError}: ${error.message}`);
    },
  });
};

export const useTransferEmployee = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: EmployeeTransferDto }) =>
      employeeService.transfer(id, data),
    onSuccess: async (employee) => {
      syncEmployeeCaches(queryClient, employee);
      await refreshActiveQueries(queryClient, [queryKeys.employees]);
      toast.success('Employee transferred successfully');
    },
    onError: (error: Error) => {
      toast.error(`${messages.employeeError}: ${error.message}`);
    },
  });
};

