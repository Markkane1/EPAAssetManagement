import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { employeeService } from '@/services/employeeService';
import type { EmployeeCreateDto, EmployeeUpdateDto } from '@/services/employeeService';
import { toast } from 'sonner';
import { API_CONFIG } from '@/config/api.config';

const { queryKeys, messages, query } = API_CONFIG;

export const useEmployees = () => {
  return useQuery({
    queryKey: queryKeys.employees,
    queryFn: employeeService.getAll,
    staleTime: query.staleTime,
  });
};

export const useEmployee = (id: string) => {
  return useQuery({
    queryKey: [...queryKeys.employees, id],
    queryFn: () => employeeService.getById(id),
    enabled: !!id,
    staleTime: query.staleTime,
  });
};

export const useEmployeesByDirectorate = (directorateId: string) => {
  return useQuery({
    queryKey: [...queryKeys.employees, 'byDirectorate', directorateId],
    queryFn: () => employeeService.getByDirectorate(directorateId),
    enabled: !!directorateId,
    staleTime: query.staleTime,
  });
};

export const useCreateEmployee = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: EmployeeCreateDto) => employeeService.create(data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.employees });
      toast.success(messages.employeeCreated);
      if (created?.tempPassword) {
        toast.info(`Temporary password: ${created.tempPassword}`);
      }
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

