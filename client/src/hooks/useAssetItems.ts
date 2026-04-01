import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assetItemService } from '@/services/assetItemService';
import type {
  AssetItemBatchCreateDto,
  AssetItemListQuery,
  AssetItemUpdateDto,
} from '@/services/assetItemService';
import { toast } from 'sonner';
import { API_CONFIG } from '@/config/api.config';
import { refreshActiveQueries } from '@/lib/queryRefresh';

const { queryKeys, messages, query } = API_CONFIG;
const { heavyList, detail } = query.profiles;

type QueryToggleOptions = {
  enabled?: boolean;
};

function isQueryToggleOptions(value: AssetItemListQuery | QueryToggleOptions) {
  return Boolean(value && typeof value === 'object' && 'enabled' in value && !('page' in value) && !('search' in value));
}

export const useAssetItems = (
  queryOrOptions: AssetItemListQuery | QueryToggleOptions = {},
  options: QueryToggleOptions = {}
) => {
  const queryParams = isQueryToggleOptions(queryOrOptions) ? {} : queryOrOptions;
  const resolvedOptions = isQueryToggleOptions(queryOrOptions) ? queryOrOptions : options;
  const { enabled = true } = resolvedOptions;
  return useQuery({
    queryKey: [
      ...queryKeys.assetItems,
      'list',
      queryParams.search?.trim() ?? '',
      queryParams.assetId ?? 'ALL_ASSETS',
      queryParams.assetName?.trim() ?? 'ALL_ASSET_NAMES',
      queryParams.categoryId ?? 'ALL_CATEGORIES',
      queryParams.subcategory ?? 'ALL_SUBCATEGORIES',
    ],
    queryFn: () => assetItemService.getAll(queryParams),
    staleTime: heavyList.staleTime,
    refetchOnWindowFocus: heavyList.refetchOnWindowFocus,
    enabled,
  });
};

export const usePagedAssetItems = (query: AssetItemListQuery, options: QueryToggleOptions = {}) => {
  const { enabled = true } = options;
  return useQuery({
    queryKey: [
      ...queryKeys.assetItems,
      'paged',
      query.page ?? 1,
      query.limit ?? null,
      query.search?.trim() ?? '',
      query.assetId ?? 'ALL_ASSETS',
      query.assetName?.trim() ?? 'ALL_ASSET_NAMES',
      query.categoryId ?? 'ALL_CATEGORIES',
      query.subcategory ?? 'ALL_SUBCATEGORIES',
    ],
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
    onSuccess: async () => {
      await refreshActiveQueries(queryClient, [queryKeys.assetItems]);
      toast.success(messages.assetItemCreated, { id: 'asset-item-mutation' });
    },
    onError: (error: Error) => {
      toast.error(`${messages.assetItemError}: ${error.message}`, { id: 'asset-item-mutation' });
    },
  });
};

export const useUpdateAssetItem = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AssetItemUpdateDto }) =>
      assetItemService.update(id, data),
    onSuccess: async () => {
      await refreshActiveQueries(queryClient, [queryKeys.assetItems]);
      toast.success(messages.assetItemUpdated, { id: 'asset-item-mutation' });
    },
    onError: (error: Error) => {
      toast.error(`${messages.assetItemError}: ${error.message}`, { id: 'asset-item-mutation' });
    },
  });
};

export const useDeleteAssetItem = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => assetItemService.delete(id),
    onSuccess: async () => {
      await refreshActiveQueries(queryClient, [queryKeys.assetItems]);
      toast.success(messages.assetItemDeleted, { id: 'asset-item-mutation' });
    },
    onError: (error: Error) => {
      toast.error(`${messages.assetItemError}: ${error.message}`, { id: 'asset-item-mutation' });
    },
  });
};
