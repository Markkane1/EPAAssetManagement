import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { locationService } from '@/services/locationService';
import type { LocationCreateDto, LocationUpdateDto } from '@/services/locationService';
import { toast } from 'sonner';
import { API_CONFIG } from '@/config/api.config';

const { queryKeys, messages, query } = API_CONFIG;

export const useLocations = () => {
  return useQuery({
    queryKey: queryKeys.locations,
    queryFn: locationService.getAll,
    staleTime: query.staleTime,
  });
};

export const useLocation = (id: string) => {
  return useQuery({
    queryKey: [...queryKeys.locations, id],
    queryFn: () => locationService.getById(id),
    enabled: !!id,
    staleTime: query.staleTime,
  });
};

export const useCreateLocation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: LocationCreateDto) => locationService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.locations });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.locations });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.locations });
      toast.success(messages.locationDeleted);
    },
    onError: (error: Error) => {
      toast.error(`${messages.locationError}: ${error.message}`);
    },
  });
};

