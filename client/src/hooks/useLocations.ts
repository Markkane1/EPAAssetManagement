import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { locationService } from '@/services/locationService';
import type { LocationCreateDto, LocationUpdateDto } from '@/services/locationService';
import { toast } from 'sonner';
import { API_CONFIG } from '@/config/api.config';
import { refreshActiveQueries } from '@/lib/queryRefresh';

const { queryKeys, messages, query } = API_CONFIG;
const { referenceData, detail } = query.profiles;

type QueryToggleOptions = {
  enabled?: boolean;
};

export const useLocations = (options: QueryToggleOptions = {}) => {
  const { enabled = true } = options;
  return useQuery({
    queryKey: queryKeys.locations,
    queryFn: locationService.getAll,
    staleTime: referenceData.staleTime,
    refetchOnWindowFocus: referenceData.refetchOnWindowFocus,
    enabled,
  });
};

export const useLocation = (id: string) => {
  return useQuery({
    queryKey: [...queryKeys.locations, id],
    queryFn: () => locationService.getById(id),
    enabled: !!id,
    staleTime: detail.staleTime,
    refetchOnWindowFocus: detail.refetchOnWindowFocus,
  });
};

export const useCreateLocation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: LocationCreateDto) => locationService.create(data),
    onSuccess: async () => {
      await refreshActiveQueries(queryClient, [queryKeys.locations]);
      toast.success(messages.locationCreated);
    },
    onError: (error: Error) => {
      toast.error(`${messages.locationError}: ${error.message}`);
    },
  });
};

export const useUpdateLocation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: LocationUpdateDto }) =>
      locationService.update(id, data),
    onSuccess: async () => {
      await refreshActiveQueries(queryClient, [queryKeys.locations]);
      toast.success(messages.locationUpdated);
    },
    onError: (error: Error) => {
      toast.error(`${messages.locationError}: ${error.message}`);
    },
  });
};

export const useDeleteLocation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => locationService.delete(id),
    onSuccess: async () => {
      await refreshActiveQueries(queryClient, [queryKeys.locations]);
      toast.success(messages.locationDeleted);
    },
    onError: (error: Error) => {
      toast.error(`${messages.locationError}: ${error.message}`);
    },
  });
};
