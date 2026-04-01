import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vendorService } from '@/services/vendorService';
import type { VendorCreateDto, VendorListQuery, VendorUpdateDto } from '@/services/vendorService';
import { toast } from 'sonner';
import { API_CONFIG } from '@/config/api.config';
import type { Vendor } from '@/types';
import {
  refreshActiveQueries,
  removeEntityFromQueryCaches,
  syncEntityInQueryCaches,
} from '@/lib/queryRefresh';

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

function matchesVendorSearch(vendor: Vendor, rawSearch: unknown) {
  const search = String(rawSearch || '').trim().toLowerCase();
  if (!search) return true;
  const haystack = [
    vendor.name,
    vendor.contact_info,
    vendor.email,
    vendor.phone,
    vendor.address,
  ]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');
  return haystack.includes(search);
}

function sortVendors(items: Vendor[]) {
  return [...items].sort((left, right) => {
    const leftTime = new Date(left.created_at || 0).getTime();
    const rightTime = new Date(right.created_at || 0).getTime();
    if (leftTime !== rightTime) return rightTime - leftTime;
    return String(left.name || '').localeCompare(String(right.name || ''));
  });
}

function syncVendorCaches(queryClient: ReturnType<typeof useQueryClient>, vendor: Vendor) {
  syncEntityInQueryCaches(queryClient, {
    queryKey: [...queryKeys.vendors, 'list'],
    entity: vendor,
    matchesQuery: (queryKey, entity) => {
      const officeFilter = String(queryKey[2] || 'all-offices');
      const matchesOffice = officeFilter === 'all-offices' || String(entity.office_id || '') === officeFilter;
      return matchesOffice && matchesVendorSearch(entity, queryKey[3]);
    },
    sortItems: sortVendors,
  });
  syncEntityInQueryCaches(queryClient, {
    queryKey: [...queryKeys.vendors, 'paged'],
    entity: vendor,
    matchesQuery: (queryKey, entity) => {
      const officeFilter = String(queryKey[4] || 'all-offices');
      const matchesOffice = officeFilter === 'all-offices' || String(entity.office_id || '') === officeFilter;
      return matchesOffice && matchesVendorSearch(entity, queryKey[5]);
    },
    getPageInfo: (queryKey) => ({
      page: Number(queryKey[2] || 1),
      limit: queryKey[3] === null ? null : Number(queryKey[3] || 0) || null,
    }),
    sortItems: sortVendors,
  });
}

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
    onSuccess: async (vendor) => {
      if (vendor?.id) {
        queryClient.setQueryData(vendorKeys.detail(vendor.id), vendor);
        syncVendorCaches(queryClient, vendor);
      }
      await refreshActiveQueries(queryClient, [
        [...queryKeys.vendors, 'list'],
        [...queryKeys.vendors, 'paged'],
      ]);
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
    onSuccess: async (vendor, variables) => {
      queryClient.setQueryData(vendorKeys.detail(variables.id), vendor);
      syncVendorCaches(queryClient, vendor);
      await refreshActiveQueries(queryClient, [
        [...queryKeys.vendors, 'list'],
        [...queryKeys.vendors, 'paged'],
      ]);
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
    onSuccess: async (_data, id) => {
      queryClient.removeQueries({ queryKey: vendorKeys.detail(id), exact: true });
      removeEntityFromQueryCaches(queryClient, [...queryKeys.vendors, 'list'], id);
      removeEntityFromQueryCaches(queryClient, [...queryKeys.vendors, 'paged'], id);
      await refreshActiveQueries(queryClient, [
        [...queryKeys.vendors, 'list'],
        [...queryKeys.vendors, 'paged'],
      ]);
      toast.success(messages.vendorDeleted);
    },
    onError: (error: Error) => {
      toast.error(`${messages.vendorError}: ${error.message}`);
    },
  });
};

