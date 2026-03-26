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

const { queryKeys, messages, query } = API_CONFIG;
const { heavyList, detail } = query.profiles;

type QueryToggleOptions = {
  enabled?: boolean;
};

export const useEmployees = (options: QueryToggleOptions = {}) => {
  const { enabled = true } = options;
  return useQuery({
    queryKey: queryKeys.employees,
    queryFn: employeeService.getAll,
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

export const useCreateEmployee = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: EmployeeCreateDto) => employeeService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.employees });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.employees });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.employees });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.employees });
      toast.success('Employee transferred successfully');
    },
    onError: (error: Error) => {
      toast.error(`${messages.employeeError}: ${error.message}`);
    },
  });
};

