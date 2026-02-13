import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { purchaseOrderService } from '@/services/purchaseOrderService';
import type { PurchaseOrderCreateDto, PurchaseOrderUpdateDto } from '@/services/purchaseOrderService';
import { toast } from 'sonner';
import { API_CONFIG } from '@/config/api.config';

const { queryKeys, messages, query } = API_CONFIG;

export const usePurchaseOrders = () => {
  return useQuery({
    queryKey: queryKeys.purchaseOrders,
    queryFn: purchaseOrderService.getAll,
    staleTime: query.staleTime,
  });
};

export const usePurchaseOrder = (id: string) => {
  return useQuery({
    queryKey: [...queryKeys.purchaseOrders, id],
    queryFn: () => purchaseOrderService.getById(id),
    enabled: !!id,
    staleTime: query.staleTime,
  });
};

export const usePurchaseOrdersByVendor = (vendorId: string) => {
  return useQuery({
    queryKey: [...queryKeys.purchaseOrders, 'byVendor', vendorId],
    queryFn: () => purchaseOrderService.getByVendor(vendorId),
    enabled: !!vendorId,
    staleTime: query.staleTime,
  });
};

export const usePurchaseOrdersByProject = (projectId: string) => {
  return useQuery({
    queryKey: [...queryKeys.purchaseOrders, 'byProject', projectId],
    queryFn: () => purchaseOrderService.getByProject(projectId),
    enabled: !!projectId,
    staleTime: query.staleTime,
  });
};

export const usePendingPurchaseOrders = () => {
  return useQuery({
    queryKey: [...queryKeys.purchaseOrders, 'pending'],
    queryFn: purchaseOrderService.getPending,
    staleTime: query.staleTime,
  });
};

export const useCreatePurchaseOrder = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: PurchaseOrderCreateDto) => purchaseOrderService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders });
      toast.success(messages.purchaseOrderCreated);
    },
    onError: (error: Error) => {
      toast.error(`${messages.purchaseOrderError}: ${error.message}`);
    },
  });
};

export const useUpdatePurchaseOrder = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: PurchaseOrderUpdateDto }) =>
      purchaseOrderService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders });
      toast.success(messages.purchaseOrderUpdated);
    },
    onError: (error: Error) => {
      toast.error(`${messages.purchaseOrderError}: ${error.message}`);
    },
  });
};

export const useDeletePurchaseOrder = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => purchaseOrderService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders });
      toast.success(messages.purchaseOrderDeleted);
    },
    onError: (error: Error) => {
      toast.error(`${messages.purchaseOrderError}: ${error.message}`);
    },
  });
};

