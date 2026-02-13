import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { divisionService } from '@/services/divisionService';
import type { DivisionCreateDto, DivisionUpdateDto } from '@/services/divisionService';
import { toast } from 'sonner';
import { API_CONFIG } from '@/config/api.config';

const { queryKeys, messages, query } = API_CONFIG;

export const useDivisions = (enabled = true) => {
  return useQuery({
    queryKey: queryKeys.divisions,
    queryFn: divisionService.getAll,
    staleTime: query.staleTime,
    enabled,
  });
};

export const useDivision = (id: string) => {
  return useQuery({
    queryKey: [...queryKeys.divisions, id],
    queryFn: () => divisionService.getById(id),
    enabled: !!id,
    staleTime: query.staleTime,
  });
};

export const useCreateDivision = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: DivisionCreateDto) => divisionService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.divisions });
      toast.success(messages.divisionCreated);
    },
    onError: (error: Error) => {
      toast.error(`${messages.divisionError}: ${error.message}`);
    },
  });
};

export const useUpdateDivision = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: DivisionUpdateDto }) =>
      divisionService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.divisions });
      toast.success(messages.divisionUpdated);
    },
    onError: (error: Error) => {
      toast.error(`${messages.divisionError}: ${error.message}`);
    },
  });
};

export const useDeleteDivision = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => divisionService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.divisions });
      toast.success(messages.divisionDeleted);
    },
    onError: (error: Error) => {
      toast.error(`${messages.divisionError}: ${error.message}`);
    },
  });
};
