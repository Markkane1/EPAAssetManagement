import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { directorateService } from '@/services/directorateService';
import type { DirectorateCreateDto, DirectorateUpdateDto } from '@/services/directorateService';
import { toast } from 'sonner';
import { API_CONFIG } from '@/config/api.config';

const { queryKeys, messages, query } = API_CONFIG;

export const useDirectorates = () => {
  return useQuery({
    queryKey: queryKeys.directorates,
    queryFn: directorateService.getAll,
    staleTime: query.staleTime,
  });
};

export const useDirectorate = (id: string) => {
  return useQuery({
    queryKey: [...queryKeys.directorates, id],
    queryFn: () => directorateService.getById(id),
    enabled: !!id,
    staleTime: query.staleTime,
  });
};

export const useCreateDirectorate = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: DirectorateCreateDto) => directorateService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.directorates });
      toast.success(messages.directorateCreated);
    },
    onError: (error: Error) => {
      toast.error(`${messages.directorateError}: ${error.message}`);
    },
  });
};

export const useUpdateDirectorate = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: DirectorateUpdateDto }) =>
      directorateService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.directorates });
      toast.success(messages.directorateUpdated);
    },
    onError: (error: Error) => {
      toast.error(`${messages.directorateError}: ${error.message}`);
    },
  });
};

export const useDeleteDirectorate = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => directorateService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.directorates });
      toast.success(messages.directorateDeleted);
    },
    onError: (error: Error) => {
      toast.error(`${messages.directorateError}: ${error.message}`);
    },
  });
};

