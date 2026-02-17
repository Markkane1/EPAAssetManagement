import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_CONFIG } from '@/config/api.config';
import { consumableContainerService } from '@/services/consumableContainerService';
import type {
  ConsumableContainerCreateDto,
  ConsumableContainerFilters,
  ConsumableContainerUpdateDto,
} from '@/services/consumableContainerService';
import { toast } from 'sonner';

const { queryKeys, query, messages } = API_CONFIG;

export const useConsumableContainers = (filters?: ConsumableContainerFilters) =>
  useQuery({
    queryKey: [...queryKeys.consumableContainers, filters || {}],
    queryFn: () => consumableContainerService.getAll(filters),
    staleTime: query.staleTime,
    enabled: filters !== undefined,
  });

export const useCreateConsumableContainer = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ConsumableContainerCreateDto) => consumableContainerService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.consumableContainers });
      queryClient.invalidateQueries({ queryKey: queryKeys.consumableBalances });
      toast.success('Container created successfully');
    },
    onError: (error: Error) => {
      toast.error(`${messages.consumableTxnError}: ${error.message}`);
    },
  });
};

export const useUpdateConsumableContainer = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ConsumableContainerUpdateDto }) =>
      consumableContainerService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.consumableContainers });
      queryClient.invalidateQueries({ queryKey: queryKeys.consumableBalances });
      toast.success('Container updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`${messages.consumableTxnError}: ${error.message}`);
    },
  });
};

export const useDeleteConsumableContainer = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => consumableContainerService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.consumableContainers });
      queryClient.invalidateQueries({ queryKey: queryKeys.consumableBalances });
      toast.success('Container deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(`${messages.consumableTxnError}: ${error.message}`);
    },
  });
};
