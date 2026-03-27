import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assetItemService } from '@/services/assetItemService';
import type {
  AssetItemBatchCreateDto,
  AssetItemListQuery,
  AssetItemUpdateDto,
} from '@/services/assetItemService';
import { toast } from 'sonner';
import { API_CONFIG } from '@/config/api.config';

const { queryKeys, messages, query } = API_CONFIG;
const { heavyList, detail } = query.profiles;

type QueryToggleOptions = {
  enabled?: boolean;
};

export const useAssetItems = (options: QueryToggleOptions = {}) => {
  const { enabled = true } = options;
  return useQuery({
    queryKey: queryKeys.assetItems,
    queryFn: assetItemService.getAll,
    staleTime: heavyList.staleTime,
    refetchOnWindowFocus: heavyList.refetchOnWindowFocus,
    enabled,
  });
};

export const usePagedAssetItems = (query: AssetItemListQuery, options: QueryToggleOptions = {}) => {
  const { enabled = true } = options;
  return useQuery({
    queryKey: [...queryKeys.assetItems, 'paged', query.page ?? 1, query.limit ?? null],
    queryFn: () => assetItemService.getPaged(query),
    staleTime: heavyList.staleTime,
    refetchOnWindowFocus: heavyList.refetchOnWindowFocus,
    enabled,
  });
};

export const useAssetItem = (id: string) => {
  return useQuery({
    queryKey: [...queryKeys.assetItems, id],
    queryFn: () => assetItemService.getById(id),
    enabled: !!id,
    staleTime: detail.staleTime,
    refetchOnWindowFocus: detail.refetchOnWindowFocus,
  });
};

export const useAssetItemsByAsset = (assetId: string) => {
  return useQuery({
    queryKey: [...queryKeys.assetItems, 'byAsset', assetId],
    queryFn: () => assetItemService.getByAsset(assetId),
    enabled: !!assetId,
    staleTime: heavyList.staleTime,
    refetchOnWindowFocus: heavyList.refetchOnWindowFocus,
  });
};

export const useAssetItemsByLocation = (locationId: string, options: QueryToggleOptions = {}) => {
  const { enabled = true } = options;
  return useQuery({
    queryKey: [...queryKeys.assetItems, 'byLocation', locationId],
    queryFn: () => assetItemService.getByLocation(locationId),
    enabled: enabled && !!locationId,
    staleTime: heavyList.staleTime,
    refetchOnWindowFocus: heavyList.refetchOnWindowFocus,
  });
};

export const useAvailableAssetItems = () => {
  return useQuery({
    queryKey: [...queryKeys.assetItems, 'available'],
    queryFn: assetItemService.getAvailable,
    staleTime: heavyList.staleTime,
    refetchOnWindowFocus: heavyList.refetchOnWindowFocus,
  });
};

export const useCreateAssetItem = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: AssetItemBatchCreateDto) => assetItemService.createMany(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.assetItems });
      toast.success(messages.assetItemCreated);
    },
    onError: (error: Error) => {
      toast.error(`${messages.assetItemError}: ${error.message}`);
    },
  });
};

export const useUpdateAssetItem = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AssetItemUpdateDto }) =>
      assetItemService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.assetItems });
      toast.success(messages.assetItemUpdated);
    },
    onError: (error: Error) => {
      toast.error(`${messages.assetItemError}: ${error.message}`);
    },
  });
};

export const useDeleteAssetItem = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => assetItemService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.assetItems });
      toast.success(messages.assetItemDeleted);
    },
    onError: (error: Error) => {
      toast.error(`${messages.assetItemError}: ${error.message}`);
    },
  });
};
