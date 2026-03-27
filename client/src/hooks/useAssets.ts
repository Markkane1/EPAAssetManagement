import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assetService } from '@/services/assetService';
import type { AssetCreateDto, AssetListQuery, AssetUpdateDto } from '@/services/assetService';
import { toast } from 'sonner';
import { API_CONFIG } from '@/config/api.config';

const { queryKeys, messages, query } = API_CONFIG;
const { heavyList, detail } = query.profiles;

const assetKeys = {
  list: (queryParams?: AssetListQuery) => [...queryKeys.assets, 'list', queryParams?.search?.trim() ?? ''] as const,
  paged: (queryParams?: AssetListQuery) => [
    ...queryKeys.assets,
    'paged',
    queryParams?.page ?? 1,
    queryParams?.limit ?? null,
    queryParams?.search?.trim() ?? '',
  ] as const,
  detail: (id: string) => [...queryKeys.assets, 'detail', id] as const,
  byCategory: (categoryId: string) => [...queryKeys.assets, 'byCategory', categoryId] as const,
  byVendor: (vendorId: string) => [...queryKeys.assets, 'byVendor', vendorId] as const,
};

type QueryToggleOptions = {
  enabled?: boolean;
};

function isQueryToggleOptions(value: AssetListQuery | QueryToggleOptions) {
  return Boolean(value && typeof value === 'object' && 'enabled' in value && !('page' in value) && !('search' in value));
}

export const useAssets = (
  queryOrOptions: AssetListQuery | QueryToggleOptions = {},
  options: QueryToggleOptions = {}
) => {
  const queryParams = isQueryToggleOptions(queryOrOptions) ? {} : queryOrOptions;
  const resolvedOptions = isQueryToggleOptions(queryOrOptions) ? queryOrOptions : options;
  const { enabled = true } = resolvedOptions;
  return useQuery({
    queryKey: assetKeys.list(queryParams),
    queryFn: () => assetService.getAll(queryParams),
    staleTime: heavyList.staleTime,
    refetchOnWindowFocus: heavyList.refetchOnWindowFocus,
    enabled,
  });
};

export const usePagedAssets = (queryParams: AssetListQuery = {}, options: QueryToggleOptions = {}) => {
  const { enabled = true } = options;
  return useQuery({
    queryKey: assetKeys.paged(queryParams),
    queryFn: () => assetService.getPaged(queryParams),
    staleTime: heavyList.staleTime,
    refetchOnWindowFocus: heavyList.refetchOnWindowFocus,
    enabled,
  });
};

export const useAsset = (id: string) => {
  return useQuery({
    queryKey: assetKeys.detail(id),
    queryFn: () => assetService.getById(id),
    enabled: !!id,
    staleTime: detail.staleTime,
    refetchOnWindowFocus: detail.refetchOnWindowFocus,
  });
};

export const useAssetsByCategory = (categoryId: string) => {
  return useQuery({
    queryKey: assetKeys.byCategory(categoryId),
    queryFn: () => assetService.getByCategory(categoryId),
    enabled: !!categoryId,
    staleTime: heavyList.staleTime,
    refetchOnWindowFocus: heavyList.refetchOnWindowFocus,
  });
};

export const useAssetsByVendor = (vendorId: string) => {
  return useQuery({
    queryKey: assetKeys.byVendor(vendorId),
    queryFn: () => assetService.getByVendor(vendorId),
    enabled: !!vendorId,
    staleTime: heavyList.staleTime,
    refetchOnWindowFocus: heavyList.refetchOnWindowFocus,
  });
};

export const useCreateAsset = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: AssetCreateDto) => assetService.create(data),
    onSuccess: (asset) => {
      if (asset?.id) {
        queryClient.setQueryData(assetKeys.detail(asset.id), asset);
      }
      queryClient.invalidateQueries({ queryKey: [...queryKeys.assets, 'list'] });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.assets, 'paged'] });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.assets, 'byCategory'] });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.assets, 'byVendor'] });
      toast.success(messages.assetCreated);
    },
    onError: (error: Error) => {
      toast.error(`${messages.assetError}: ${error.message}`);
    },
  });
};

export const useUpdateAsset = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AssetUpdateDto }) =>
      assetService.update(id, data),
    onSuccess: (asset, variables) => {
      queryClient.setQueryData(assetKeys.detail(variables.id), asset);
      queryClient.invalidateQueries({ queryKey: [...queryKeys.assets, 'list'] });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.assets, 'paged'] });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.assets, 'byCategory'] });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.assets, 'byVendor'] });
      toast.success(messages.assetUpdated);
    },
    onError: (error: Error) => {
      toast.error(`${messages.assetError}: ${error.message}`);
    },
  });
};

export const useDeleteAsset = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => assetService.delete(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: assetKeys.detail(id), exact: true });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.assets, 'list'] });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.assets, 'paged'] });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.assets, 'byCategory'] });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.assets, 'byVendor'] });
      toast.success(messages.assetDeleted);
    },
    onError: (error: Error) => {
      toast.error(`${messages.assetError}: ${error.message}`);
    },
  });
};

