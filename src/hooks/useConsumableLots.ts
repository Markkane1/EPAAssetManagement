import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { consumableLotService } from '@/services/consumableLotService';
import type { ConsumableLotCreateDto, ConsumableLotUpdateDto, ConsumableLotFilters } from '@/services/consumableLotService';
import { API_CONFIG } from '@/config/api.config';

const { queryKeys, messages, query } = API_CONFIG;

export const useConsumableLots = (filters?: ConsumableLotFilters) =>
  useQuery({
    queryKey: [...queryKeys.consumableLots, filters || {}],
    queryFn: () => consumableLotService.getAll(filters),
    staleTime: query.staleTime,
  });

export const useCreateConsumableLot = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ConsumableLotCreateDto) => consumableLotService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.consumableLots });
      toast.success(messages.consumableLotCreated);
    },
    onError: (error: Error) => {
      toast.error(`${messages.consumableLotError}: ${error.message}`);
    },
  });
};

export const useUpdateConsumableLot = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ConsumableLotUpdateDto }) =>
      consumableLotService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.consumableLots });
      toast.success(messages.consumableLotUpdated);
    },
    onError: (error: Error) => {
      toast.error(`${messages.consumableLotError}: ${error.message}`);
    },
  });
};

export const useDeleteConsumableLot = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => consumableLotService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.consumableLots });
      toast.success(messages.consumableLotDeleted);
    },
    onError: (error: Error) => {
      toast.error(`${messages.consumableLotError}: ${error.message}`);
    },
  });
};
