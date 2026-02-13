import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vendorService } from '@/services/vendorService';
import type { VendorCreateDto, VendorUpdateDto } from '@/services/vendorService';
import { toast } from 'sonner';
import { API_CONFIG } from '@/config/api.config';

const { queryKeys, messages, query } = API_CONFIG;

export const useVendors = () => {
  return useQuery({
    queryKey: queryKeys.vendors,
    queryFn: vendorService.getAll,
    staleTime: query.staleTime,
  });
};

export const useVendor = (id: string) => {
  return useQuery({
    queryKey: [...queryKeys.vendors, id],
    queryFn: () => vendorService.getById(id),
    enabled: !!id,
    staleTime: query.staleTime,
  });
};

export const useCreateVendor = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: VendorCreateDto) => vendorService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vendors });
      toast.success(messages.vendorCreated);
    },
    onError: (error: Error) => {
      toast.error(`${messages.vendorError}: ${error.message}`);
    },
  });
};

export const useUpdateVendor = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: VendorUpdateDto }) =>
      vendorService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vendors });
      toast.success(messages.vendorUpdated);
    },
    onError: (error: Error) => {
      toast.error(`${messages.vendorError}: ${error.message}`);
    },
  });
};

export const useDeleteVendor = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => vendorService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vendors });
      toast.success(messages.vendorDeleted);
    },
    onError: (error: Error) => {
      toast.error(`${messages.vendorError}: ${error.message}`);
    },
  });
};

