import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { consumableInventoryService } from '@/services/consumableInventoryService';
import type {
  ReceivePayload,
  TransferPayload,
  ConsumePayload,
  AdjustPayload,
  DisposePayload,
  ReturnPayload,
  OpeningBalancePayload,
  BalancesQuery,
  LedgerQuery,
  InventoryHolderType,
} from '@/services/consumableInventoryService';
import { API_CONFIG } from '@/config/api.config';
import { ApiError } from '@/lib/api';

const { queryKeys, messages, query } = API_CONFIG;
const { detail } = query.profiles;

type QueryToggleOptions = {
  enabled?: boolean;
};

function getApprovalRequestId(error: Error) {
  if (!(error instanceof ApiError) || error.status !== 409) return '';
  const approvalRequest =
    (error.details as Record<string, unknown> | undefined)?.approval_request as
      | Record<string, unknown>
      | undefined;
  return String(approvalRequest?.id || approvalRequest?._id || '').trim();
}

export const useConsumableBalances = (filters?: BalancesQuery, options: QueryToggleOptions = {}) =>
  useQuery({
    queryKey: [...queryKeys.consumableBalances, filters || {}],
    queryFn: () => consumableInventoryService.getBalances(filters),
    staleTime: query.staleTime,
    enabled: options.enabled ?? true,
  });

export const useConsumableLedger = (filters?: LedgerQuery, options: QueryToggleOptions = {}) =>
  useQuery({
    queryKey: [...queryKeys.consumableLedger, filters || {}],
    queryFn: () => consumableInventoryService.getLedger(filters),
    staleTime: query.staleTime,
    enabled: options.enabled ?? true,
  });

export const useConsumableRollup = (itemId?: string, options: QueryToggleOptions = {}) =>
  useQuery({
    queryKey: [...queryKeys.consumableRollup, itemId || 'all'],
    queryFn: () => consumableInventoryService.getRollup(itemId),
    enabled: (options.enabled ?? true) && !!itemId,
    staleTime: detail.staleTime,
    refetchOnWindowFocus: detail.refetchOnWindowFocus,
  });

export const useConsumableExpiry = (
  days?: number,
  holderType?: InventoryHolderType,
  holderId?: string
) =>
  useQuery({
    queryKey: [...queryKeys.consumableExpiry, days || 30, holderType || 'any', holderId || 'all'],
    queryFn: () => consumableInventoryService.getExpiry(days, holderType, holderId),
    staleTime: query.staleTime,
  });

export const useReceiveConsumables = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ReceivePayload) => consumableInventoryService.receive(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.consumableBalances });
      queryClient.invalidateQueries({ queryKey: queryKeys.consumableLedger });
      toast.success(messages.consumableTxnSuccess);
    },
    onError: (error: Error) => {
      toast.error(`${messages.consumableTxnError}: ${error.message}`);
    },
  });
};

export const useReceiveConsumablesOffice = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ReceivePayload) => consumableInventoryService.receiveOffice(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.consumableBalances });
      queryClient.invalidateQueries({ queryKey: queryKeys.consumableLedger });
      toast.success('Stock received into your office successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to receive stock: ${error.message}`);
    },
  });
};

export const useTransferConsumables = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: TransferPayload) => consumableInventoryService.transfer(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.consumableBalances });
      queryClient.invalidateQueries({ queryKey: queryKeys.consumableLedger });
      toast.success(messages.consumableTxnSuccess);
    },
    onError: (error: Error) => {
      const approvalRequestId = getApprovalRequestId(error);
      if (approvalRequestId) {
        toast.error(`Approval required before this consumable transfer step. Workflow id: ${approvalRequestId}`);
        return;
      }
      toast.error(`${messages.consumableTxnError}: ${error.message}`);
    },
  });
};

export const useConsumeConsumables = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ConsumePayload) => consumableInventoryService.consume(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.consumableBalances });
      queryClient.invalidateQueries({ queryKey: queryKeys.consumableLedger });
      toast.success(messages.consumableTxnSuccess);
    },
    onError: (error: Error) => {
      toast.error(`${messages.consumableTxnError}: ${error.message}`);
    },
  });
};

export const useAdjustConsumables = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AdjustPayload) => consumableInventoryService.adjust(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.consumableBalances });
      queryClient.invalidateQueries({ queryKey: queryKeys.consumableLedger });
      toast.success(messages.consumableTxnSuccess);
    },
    onError: (error: Error) => {
      toast.error(`${messages.consumableTxnError}: ${error.message}`);
    },
  });
};

export const useDisposeConsumables = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: DisposePayload) => consumableInventoryService.dispose(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.consumableBalances });
      queryClient.invalidateQueries({ queryKey: queryKeys.consumableLedger });
      toast.success(messages.consumableTxnSuccess);
    },
    onError: (error: Error) => {
      const approvalRequestId = getApprovalRequestId(error);
      if (approvalRequestId) {
        toast.error(`Approval required before disposal. Workflow id: ${approvalRequestId}`);
        return;
      }
      toast.error(`${messages.consumableTxnError}: ${error.message}`);
    },
  });
};

export const useReturnConsumables = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ReturnPayload) => consumableInventoryService.returnToCentral(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.consumableBalances });
      queryClient.invalidateQueries({ queryKey: queryKeys.consumableLedger });
      toast.success(messages.consumableTxnSuccess);
    },
    onError: (error: Error) => {
      toast.error(`${messages.consumableTxnError}: ${error.message}`);
    },
  });
};

export const useOpeningBalanceConsumables = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: OpeningBalancePayload) => consumableInventoryService.openingBalance(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.consumableBalances });
      queryClient.invalidateQueries({ queryKey: queryKeys.consumableLedger });
      toast.success(messages.consumableTxnSuccess);
    },
    onError: (error: Error) => {
      toast.error(`${messages.consumableTxnError}: ${error.message}`);
    },
  });
};
