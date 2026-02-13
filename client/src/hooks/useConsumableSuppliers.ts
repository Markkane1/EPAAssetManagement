import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { consumableSupplierService } from '@/services/consumableSupplierService';
import type { ConsumableSupplierCreateDto, ConsumableSupplierUpdateDto } from '@/services/consumableSupplierService';
import { API_CONFIG } from '@/config/api.config';

const { queryKeys, messages, query } = API_CONFIG;

export const useConsumableSuppliers = () =>
  useQuery({
    queryKey: queryKeys.consumableSuppliers,
    queryFn: consumableSupplierService.getAll,
    staleTime: query.staleTime,
  });

export const useCreateConsumableSupplier = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ConsumableSupplierCreateDto) => consumableSupplierService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.consumableSuppliers });
      toast.success(messages.consumableSupplierCreated);
    },
    onError: (error: Error) => {
      toast.error(`${messages.consumableSupplierError}: ${error.message}`);
    },
  });
};

export const useUpdateConsumableSupplier = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ConsumableSupplierUpdateDto }) =>
      consumableSupplierService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.consumableSuppliers });
      toast.success(messages.consumableSupplierUpdated);
    },
    onError: (error: Error) => {
      toast.error(`${messages.consumableSupplierError}: ${error.message}`);
    },
  });
};

export const useDeleteConsumableSupplier = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => consumableSupplierService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.consumableSuppliers });
      toast.success(messages.consumableSupplierDeleted);
    },
    onError: (error: Error) => {
      toast.error(`${messages.consumableSupplierError}: ${error.message}`);
    },
  });
};
