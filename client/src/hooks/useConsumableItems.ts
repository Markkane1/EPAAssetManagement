import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { consumableItemService } from '@/services/consumableItemService';
import type { ConsumableItemCreateDto, ConsumableItemUpdateDto } from '@/services/consumableItemService';
import { API_CONFIG } from '@/config/api.config';
import { refreshActiveQueries } from '@/lib/queryRefresh';

const { queryKeys, messages, query } = API_CONFIG;
const { heavyList } = query.profiles;

type QueryToggleOptions = {
  enabled?: boolean;
};

export const useConsumableItems = (options: QueryToggleOptions = {}) => {
  const { enabled = true } = options;
  return useQuery({
    queryKey: queryKeys.consumableItems,
    queryFn: consumableItemService.getAll,
    staleTime: heavyList.staleTime,
    refetchOnWindowFocus: heavyList.refetchOnWindowFocus,
    enabled,
  });
};

export const useCreateConsumableItem = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ConsumableItemCreateDto) => consumableItemService.create(data),
    onSuccess: async () => {
      await refreshActiveQueries(queryClient, [queryKeys.consumableItems]);
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
    onSuccess: async () => {
      await refreshActiveQueries(queryClient, [queryKeys.consumableItems]);
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
    onSuccess: async () => {
      await refreshActiveQueries(queryClient, [queryKeys.consumableItems]);
      toast.success(messages.consumableItemDeleted);
    },
    onError: (error: Error) => {
      toast.error(`${messages.consumableItemError}: ${error.message}`);
    },
  });
};
