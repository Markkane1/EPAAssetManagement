import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { transferService } from '@/services/transferService';
import type { TransferCreateDto } from '@/services/transferService';
import { toast } from 'sonner';
import { API_CONFIG } from '@/config/api.config';

const { queryKeys, messages, query } = API_CONFIG;

export const useTransfers = () => {
  return useQuery({
    queryKey: queryKeys.transfers,
    queryFn: transferService.getAll,
    staleTime: query.staleTime,
  });
};

export const useTransfer = (id: string) => {
  return useQuery({
    queryKey: [...queryKeys.transfers, id],
    queryFn: () => transferService.getById(id),
    enabled: !!id,
    staleTime: query.staleTime,
  });
};

export const useTransfersByAssetItem = (assetItemId: string) => {
  return useQuery({
    queryKey: [...queryKeys.transfers, 'byAssetItem', assetItemId],
    queryFn: () => transferService.getByAssetItem(assetItemId),
    enabled: !!assetItemId,
    staleTime: query.staleTime,
  });
};

export const useTransfersByLocation = (locationId: string) => {
  return useQuery({
    queryKey: [...queryKeys.transfers, 'byLocation', locationId],
    queryFn: () => transferService.getByLocation(locationId),
    enabled: !!locationId,
    staleTime: query.staleTime,
  });
};

export const useRecentTransfers = (limit?: number) => {
  return useQuery({
    queryKey: [...queryKeys.transfers, 'recent', limit],
    queryFn: () => transferService.getRecent(limit),
    staleTime: query.staleTime,
  });
};

export const useCreateTransfer = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: TransferCreateDto) => transferService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transfers });
      queryClient.invalidateQueries({ queryKey: queryKeys.assetItems });
      toast.success(messages.transferCreated);
    },
    onError: (error: Error) => {
      toast.error(`${messages.transferError}: ${error.message}`);
    },
  });
};

export const useDeleteTransfer = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => transferService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transfers });
      toast.success(messages.transferDeleted);
    },
    onError: (error: Error) => {
      toast.error(`${messages.transferError}: ${error.message}`);
    },
  });
};

