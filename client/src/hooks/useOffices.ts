import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { officeService } from '@/services/officeService';
import type { OfficeCreateDto, OfficeFilters, OfficeListQuery, OfficeUpdateDto } from '@/services/officeService';
import { toast } from 'sonner';
import { API_CONFIG } from '@/config/api.config';
import type { Office } from '@/types';

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
    onSuccess: (office) => {
      if (office?.id) {
        queryClient.setQueryData(officeKeys.detail(office.id), office);
      }
      queryClient.invalidateQueries({ queryKey: [...queryKeys.offices, 'list'] });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.offices, 'paged'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.locations });
      queryClient.invalidateQueries({ queryKey: queryKeys.directorates });
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
    onSuccess: (office, variables) => {
      queryClient.setQueryData(officeKeys.detail(variables.id), office);
      queryClient.invalidateQueries({ queryKey: [...queryKeys.offices, 'list'] });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.offices, 'paged'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.locations });
      queryClient.invalidateQueries({ queryKey: queryKeys.directorates });
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
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: officeKeys.detail(id), exact: true });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.offices, 'list'] });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.offices, 'paged'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.locations });
      queryClient.invalidateQueries({ queryKey: queryKeys.directorates });
      toast.success(messages.officeDeleted);
    },
    onError: (error: Error) => {
      toast.error(`${messages.officeError}: ${error.message}`);
    },
  });
};
