import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assetItemService } from '@/services/assetItemService';
import type { AssetItemBatchCreateDto, AssetItemUpdateDto } from '@/services/assetItemService';
import { toast } from 'sonner';
import { API_CONFIG } from '@/config/api.config';

const { queryKeys, messages, query } = API_CONFIG;

export const useAssetItems = () => {
  return useQuery({
    queryKey: queryKeys.assetItems,
    queryFn: assetItemService.getAll,
    staleTime: query.staleTime,
  });
};

export const useAssetItem = (id: string) => {
  return useQuery({
    queryKey: [...queryKeys.assetItems, id],
    queryFn: () => assetItemService.getById(id),
    enabled: !!id,
    staleTime: query.staleTime,
  });
};

export const useAssetItemsByAsset = (assetId: string) => {
  return useQuery({
    queryKey: [...queryKeys.assetItems, 'byAsset', assetId],
    queryFn: () => assetItemService.getByAsset(assetId),
    enabled: !!assetId,
    staleTime: query.staleTime,
  });
};

export const useAssetItemsByLocation = (locationId: string) => {
  return useQuery({
    queryKey: [...queryKeys.assetItems, 'byLocation', locationId],
    queryFn: () => assetItemService.getByLocation(locationId),
    enabled: !!locationId,
    staleTime: query.staleTime,
  });
};

export const useAvailableAssetItems = () => {
  return useQuery({
    queryKey: [...queryKeys.assetItems, 'available'],
    queryFn: assetItemService.getAvailable,
    staleTime: query.staleTime,
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

