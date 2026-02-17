import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { officeService } from '@/services/officeService';
import type { OfficeCreateDto, OfficeFilters, OfficeUpdateDto } from '@/services/officeService';
import { toast } from 'sonner';
import { API_CONFIG } from '@/config/api.config';
import type { Office } from '@/types';

const { queryKeys, messages, query } = API_CONFIG;

export const useOffices = (filters?: OfficeFilters) => {
  return useQuery({
    queryKey: [...queryKeys.offices, 'all', filters || {}],
    queryFn: () => officeService.getAll(filters) as Promise<Office[]>,
    staleTime: query.staleTime,
  });
};

export const useOffice = (id: string) => {
  return useQuery({
    queryKey: [...queryKeys.offices, id],
    queryFn: () => officeService.getById(id),
    enabled: !!id,
    staleTime: query.staleTime,
  });
};

export const useCreateOffice = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: OfficeCreateDto) => officeService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.offices });
      queryClient.invalidateQueries({ queryKey: queryKeys.locations });
      queryClient.invalidateQueries({ queryKey: queryKeys.directorates });
      toast.success(messages.officeCreated);
    },
    onError: (error: Error) => {
      toast.error(`${messages.officeError}: ${error.message}`);
    },
  });
};

export const useUpdateOffice = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: OfficeUpdateDto }) =>
      officeService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.offices });
      queryClient.invalidateQueries({ queryKey: queryKeys.locations });
      queryClient.invalidateQueries({ queryKey: queryKeys.directorates });
      toast.success(messages.officeUpdated);
    },
    onError: (error: Error) => {
      toast.error(`${messages.officeError}: ${error.message}`);
    },
  });
};

export const useDeleteOffice = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => officeService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.offices });
      queryClient.invalidateQueries({ queryKey: queryKeys.locations });
      queryClient.invalidateQueries({ queryKey: queryKeys.directorates });
      toast.success(messages.officeDeleted);
    },
    onError: (error: Error) => {
      toast.error(`${messages.officeError}: ${error.message}`);
    },
  });
};
