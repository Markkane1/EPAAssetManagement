import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vendorService } from '@/services/vendorService';
import type { VendorCreateDto, VendorListQuery, VendorUpdateDto } from '@/services/vendorService';
import { toast } from 'sonner';
import { API_CONFIG } from '@/config/api.config';

const { queryKeys, messages, query } = API_CONFIG;
const { heavyList, detail } = query.profiles;
type QueryToggleOptions = {
  enabled?: boolean;
};

const vendorKeys = {
  list: (query?: VendorListQuery) => [
    ...queryKeys.vendors,
    'list',
    query?.officeId?.trim() ?? 'all-offices',
    query?.search?.trim() ?? '',
  ] as const,
  paged: (query?: VendorListQuery) => [
    ...queryKeys.vendors,
    'paged',
    query?.page ?? 1,
    query?.limit ?? null,
    query?.officeId?.trim() ?? 'all-offices',
    query?.search?.trim() ?? '',
  ] as const,
  detail: (id: string) => [...queryKeys.vendors, 'detail', id] as const,
};

export const useVendors = (officeId?: string, search?: string, options: QueryToggleOptions = {}) => {
  const { enabled = true } = options;
  const queryParams = {
    officeId: String(officeId || '').trim() || undefined,
    search: search?.trim() || undefined,
  };
  return useQuery({
    queryKey: vendorKeys.list(queryParams),
    queryFn: () => vendorService.getAll(queryParams),
    staleTime: heavyList.staleTime,
    refetchOnWindowFocus: heavyList.refetchOnWindowFocus,
    enabled,
  });
};

export const usePagedVendors = (queryParams: VendorListQuery = {}) => {
  return useQuery({
    queryKey: vendorKeys.paged(queryParams),
    queryFn: () => vendorService.getPaged(queryParams),
    staleTime: heavyList.staleTime,
    refetchOnWindowFocus: heavyList.refetchOnWindowFocus,
  });
};

export const useVendor = (id: string) => {
  return useQuery({
    queryKey: vendorKeys.detail(id),
    queryFn: () => vendorService.getById(id),
    enabled: !!id,
    staleTime: detail.staleTime,
    refetchOnWindowFocus: detail.refetchOnWindowFocus,
  });
};

export const useCreateVendor = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: VendorCreateDto) => vendorService.create(data),
    onSuccess: (vendor) => {
      if (vendor?.id) {
        queryClient.setQueryData(vendorKeys.detail(vendor.id), vendor);
      }
      queryClient.invalidateQueries({ queryKey: [...queryKeys.vendors, 'list'] });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.vendors, 'paged'] });
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
    onSuccess: (vendor, variables) => {
      queryClient.setQueryData(vendorKeys.detail(variables.id), vendor);
      queryClient.invalidateQueries({ queryKey: [...queryKeys.vendors, 'list'] });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.vendors, 'paged'] });
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
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: vendorKeys.detail(id), exact: true });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.vendors, 'list'] });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.vendors, 'paged'] });
      toast.success(messages.vendorDeleted);
    },
    onError: (error: Error) => {
      toast.error(`${messages.vendorError}: ${error.message}`);
    },
  });
};

