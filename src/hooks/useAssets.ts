import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assetService } from '@/services/assetService';
import type { AssetCreateDto, AssetUpdateDto } from '@/services/assetService';
import { toast } from 'sonner';
import { API_CONFIG } from '@/config/api.config';

const { queryKeys, messages, query } = API_CONFIG;

export const useAssets = () => {
  return useQuery({
    queryKey: queryKeys.assets,
    queryFn: assetService.getAll,
    staleTime: query.staleTime,
  });
};

export const useAsset = (id: string) => {
  return useQuery({
    queryKey: [...queryKeys.assets, id],
    queryFn: () => assetService.getById(id),
    enabled: !!id,
    staleTime: query.staleTime,
  });
};

export const useAssetsByCategory = (categoryId: string) => {
  return useQuery({
    queryKey: [...queryKeys.assets, 'byCategory', categoryId],
    queryFn: () => assetService.getByCategory(categoryId),
    enabled: !!categoryId,
    staleTime: query.staleTime,
  });
};

export const useAssetsByVendor = (vendorId: string) => {
  return useQuery({
    queryKey: [...queryKeys.assets, 'byVendor', vendorId],
    queryFn: () => assetService.getByVendor(vendorId),
    enabled: !!vendorId,
    staleTime: query.staleTime,
  });
};

export const useCreateAsset = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: AssetCreateDto) => assetService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.assets });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.assets });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.assets });
      toast.success(messages.assetDeleted);
    },
    onError: (error: Error) => {
      toast.error(`${messages.assetError}: ${error.message}`);
    },
  });
};

