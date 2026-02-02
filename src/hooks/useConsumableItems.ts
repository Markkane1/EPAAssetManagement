import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { consumableItemService } from '@/services/consumableItemService';
import type { ConsumableItemCreateDto, ConsumableItemUpdateDto } from '@/services/consumableItemService';
import { API_CONFIG } from '@/config/api.config';

const { queryKeys, messages, query } = API_CONFIG;

export const useConsumableItems = () =>
  useQuery({
    queryKey: queryKeys.consumableItems,
    queryFn: consumableItemService.getAll,
    staleTime: query.staleTime,
  });

export const useCreateConsumableItem = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ConsumableItemCreateDto) => consumableItemService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.consumableItems });
      toast.success(messages.consumableItemCreated);
    },
    onError: (error: Error) => {
      toast.error(`${messages.consumableItemError}: ${error.message}`);
    },
  });
};

export const useUpdateConsumableItem = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ConsumableItemUpdateDto }) =>
      consumableItemService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.consumableItems });
      toast.success(messages.consumableItemUpdated);
    },
    onError: (error: Error) => {
      toast.error(`${messages.consumableItemError}: ${error.message}`);
    },
  });
};

export const useDeleteConsumableItem = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => consumableItemService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.consumableItems });
      toast.success(messages.consumableItemDeleted);
    },
    onError: (error: Error) => {
      toast.error(`${messages.consumableItemError}: ${error.message}`);
    },
  });
};
