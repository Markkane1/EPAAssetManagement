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

const { queryKeys, messages, query } = API_CONFIG;

export const useConsumableBalances = (filters?: BalancesQuery) =>
  useQuery({
    queryKey: [...queryKeys.consumableBalances, filters || {}],
    queryFn: () => consumableInventoryService.getBalances(filters),
    staleTime: query.staleTime,
  });

export const useConsumableLedger = (filters?: LedgerQuery) =>
  useQuery({
    queryKey: [...queryKeys.consumableLedger, filters || {}],
    queryFn: () => consumableInventoryService.getLedger(filters),
    staleTime: query.staleTime,
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
