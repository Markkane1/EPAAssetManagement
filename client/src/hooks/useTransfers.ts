import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { transferService } from '@/services/transferService';
import type { TransferCreateDto, TransferStatusUpdateDto } from '@/services/transferService';
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

export const useUpdateTransferStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: TransferStatusUpdateDto }) =>
      transferService.updateStatus(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transfers });
      queryClient.invalidateQueries({ queryKey: queryKeys.assetItems });
      toast.success(messages.transferUpdated);
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
