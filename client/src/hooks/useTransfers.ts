import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { transferService } from '@/services/transferService';
import type { TransferCreateDto } from '@/services/transferService';
import { toast } from 'sonner';
import { API_CONFIG } from '@/config/api.config';
import { ApiError } from '@/lib/api';

const { queryKeys, messages, query } = API_CONFIG;

export const useTransfers = () => {
  return useQuery({
    queryKey: queryKeys.transfers,
    queryFn: transferService.getAll,
    staleTime: query.staleTime,
  });
};

export const useTransfer = (id?: string) => {
  return useQuery({
    queryKey: [...queryKeys.transfers, id],
    queryFn: () => transferService.getById(String(id)),
    enabled: Boolean(id),
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

export type TransferActionType =
  | 'approve'
  | 'dispatch_to_store'
  | 'receive_at_store'
  | 'dispatch_to_dest'
  | 'receive_at_dest'
  | 'reject'
  | 'cancel';

export const useTransferAction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      action,
      handoverDocumentId,
      takeoverDocumentId,
      approvalWorkflowId,
    }: {
      id: string;
      action: TransferActionType;
      handoverDocumentId?: string;
      takeoverDocumentId?: string;
      approvalWorkflowId?: string;
    }) => {
      switch (action) {
        case 'approve':
          return transferService.approve(id, approvalWorkflowId);
        case 'dispatch_to_store':
          if (!handoverDocumentId) throw new Error('Handover document is required');
          return transferService.dispatchToStore(id, handoverDocumentId);
        case 'receive_at_store':
          return transferService.receiveAtStore(id);
        case 'dispatch_to_dest':
          return transferService.dispatchToDest(id);
        case 'receive_at_dest':
          if (!takeoverDocumentId) throw new Error('Takeover document is required');
          return transferService.receiveAtDest(id, takeoverDocumentId);
        case 'reject':
          return transferService.reject(id);
        case 'cancel':
          return transferService.cancel(id);
        default:
          throw new Error('Unsupported transfer action');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transfers });
      queryClient.invalidateQueries({ queryKey: queryKeys.assetItems });
      toast.success(messages.transferUpdated);
    },
    onError: (error: Error) => {
      if (error instanceof ApiError && error.status === 409) {
        const approvalRequest =
          (error.details as Record<string, unknown> | undefined)?.approval_request as
            | Record<string, unknown>
            | undefined;
        const approvalRequestId = String(approvalRequest?.id || approvalRequest?._id || '').trim();
        if (approvalRequestId) {
          toast.error(
            `Approval required before this transfer step. Workflow id: ${approvalRequestId}`
          );
          return;
        }
      }
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
