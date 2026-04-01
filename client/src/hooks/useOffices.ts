import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { officeService } from '@/services/officeService';
import type { OfficeCreateDto, OfficeFilters, OfficeListQuery, OfficeUpdateDto } from '@/services/officeService';
import { toast } from 'sonner';
import { API_CONFIG } from '@/config/api.config';
import type { Office } from '@/types';
import {
  refreshActiveQueries,
  removeEntityFromQueryCaches,
  syncEntityInQueryCaches,
} from '@/lib/queryRefresh';

const { queryKeys, messages, query } = API_CONFIG;
const { referenceData, detail, heavyList } = query.profiles;

const officeKeys = {
  list: (filters?: OfficeFilters) => [
    ...queryKeys.offices,
    'list',
    filters?.type ?? 'all-types',
    filters?.capability ?? 'all-capabilities',
    filters?.isActive === undefined ? 'all-active' : String(filters.isActive),
    filters?.search?.trim() ?? '',
  ] as const,
  paged: (filters?: OfficeListQuery) => [
    ...queryKeys.offices,
    'paged',
    filters?.page ?? 1,
    filters?.limit ?? null,
    filters?.type ?? 'all-types',
    filters?.capability ?? 'all-capabilities',
    filters?.isActive === undefined ? 'all-active' : String(filters.isActive),
    filters?.search?.trim() ?? '',
  ] as const,
  detail: (id: string) => [...queryKeys.offices, 'detail', id] as const,
};

function matchesOfficeSearch(office: Office, rawSearch: unknown) {
  const search = String(rawSearch || '').trim().toLowerCase();
  if (!search) return true;
  const haystack = [
    office.name,
    office.division,
    office.district,
    office.address,
    office.contact_number,
    office.type,
  ]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');
  return haystack.includes(search);
}

function matchesOfficeCapability(office: Office, capability: string) {
  if (capability === 'all-capabilities') return true;
  if (capability === 'chemicals') {
    return office.type === 'DISTRICT_LAB' || Boolean(office.capabilities?.chemicals);
  }
  if (capability === 'consumables') {
    return office.capabilities?.consumables !== false;
  }
  return true;
}

function sortOffices(items: Office[]) {
  return [...items].sort((left, right) => {
    const leftTime = new Date(left.created_at || 0).getTime();
    const rightTime = new Date(right.created_at || 0).getTime();
    if (leftTime !== rightTime) return rightTime - leftTime;
    return String(left.name || '').localeCompare(String(right.name || ''));
  });
}

function syncOfficeCaches(queryClient: ReturnType<typeof useQueryClient>, office: Office) {
  syncEntityInQueryCaches(queryClient, {
    queryKey: [...queryKeys.offices, 'list'],
    entity: office,
    matchesQuery: (queryKey, entity) => {
      const type = String(queryKey[2] || 'all-types');
      const capability = String(queryKey[3] || 'all-capabilities');
      const isActive = String(queryKey[4] || 'all-active');
      const matchesType = type === 'all-types' || String(entity.type || '') === type;
      const matchesActive = isActive === 'all-active' || String(entity.is_active !== false) === isActive;
      return matchesType && matchesActive && matchesOfficeCapability(entity, capability) && matchesOfficeSearch(entity, queryKey[5]);
    },
    sortItems: sortOffices,
  });
  syncEntityInQueryCaches(queryClient, {
    queryKey: [...queryKeys.offices, 'paged'],
    entity: office,
    matchesQuery: (queryKey, entity) => {
      const type = String(queryKey[4] || 'all-types');
      const capability = String(queryKey[5] || 'all-capabilities');
      const isActive = String(queryKey[6] || 'all-active');
      const matchesType = type === 'all-types' || String(entity.type || '') === type;
      const matchesActive = isActive === 'all-active' || String(entity.is_active !== false) === isActive;
      return matchesType && matchesActive && matchesOfficeCapability(entity, capability) && matchesOfficeSearch(entity, queryKey[7]);
    },
    getPageInfo: (queryKey) => ({
      page: Number(queryKey[2] || 1),
      limit: queryKey[3] === null ? null : Number(queryKey[3] || 0) || null,
    }),
    sortItems: sortOffices,
  });
}

export const useOffices = (filters?: OfficeFilters) => {
  return useQuery({
    queryKey: officeKeys.list(filters),
    queryFn: () => officeService.getAll(filters) as Promise<Office[]>,
    staleTime: referenceData.staleTime,
    refetchOnWindowFocus: referenceData.refetchOnWindowFocus,
  });
};

export const usePagedOffices = (filters?: OfficeListQuery) => {
  return useQuery({
    queryKey: officeKeys.paged(filters),
    queryFn: () => officeService.getPaged(filters),
    staleTime: heavyList.staleTime,
    refetchOnWindowFocus: heavyList.refetchOnWindowFocus,
  });
};

export const useOffice = (id: string) => {
  return useQuery({
    queryKey: officeKeys.detail(id),
    queryFn: () => officeService.getById(id),
    enabled: !!id,
    staleTime: detail.staleTime,
    refetchOnWindowFocus: detail.refetchOnWindowFocus,
  });
};

export const useCreateOffice = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: OfficeCreateDto) => officeService.create(data),
    onSuccess: async (office) => {
      if (office?.id) {
        queryClient.setQueryData(officeKeys.detail(office.id), office);
        syncOfficeCaches(queryClient, office);
      }
      await refreshActiveQueries(queryClient, [
        [...queryKeys.offices, 'list'],
        [...queryKeys.offices, 'paged'],
        queryKeys.locations,
        queryKeys.directorates,
      ]);
      toast.success(messages.officeCreated);
    },
    onError: (error: Error) => {
      toast.error(`${messages.officeError}: ${error.message}`);
    },
  });
};

export const useUpdateOffice = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: OfficeUpdateDto }) =>
      officeService.update(id, data),
    onSuccess: async (office, variables) => {
      queryClient.setQueryData(officeKeys.detail(variables.id), office);
      syncOfficeCaches(queryClient, office);
      await refreshActiveQueries(queryClient, [
        [...queryKeys.offices, 'list'],
        [...queryKeys.offices, 'paged'],
        queryKeys.locations,
        queryKeys.directorates,
      ]);
      toast.success(messages.officeUpdated);
    },
    onError: (error: Error) => {
      toast.error(`${messages.officeError}: ${error.message}`);
    },
  });
};

export const useDeleteOffice = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => officeService.delete(id),
    onSuccess: async (_data, id) => {
      queryClient.removeQueries({ queryKey: officeKeys.detail(id), exact: true });
      removeEntityFromQueryCaches(queryClient, [...queryKeys.offices, 'list'], id);
      removeEntityFromQueryCaches(queryClient, [...queryKeys.offices, 'paged'], id);
      await refreshActiveQueries(queryClient, [
        [...queryKeys.offices, 'list'],
        [...queryKeys.offices, 'paged'],
        queryKeys.locations,
        queryKeys.directorates,
      ]);
      toast.success(messages.officeDeleted);
    },
    onError: (error: Error) => {
      toast.error(`${messages.officeError}: ${error.message}`);
    },
  });
};
