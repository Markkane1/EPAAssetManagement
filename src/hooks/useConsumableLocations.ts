import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { consumableLocationService } from '@/services/consumableLocationService';
import type { ConsumableLocationCreateDto, ConsumableLocationUpdateDto } from '@/services/consumableLocationService';
import { API_CONFIG } from '@/config/api.config';

const { queryKeys, messages, query } = API_CONFIG;

export const useConsumableLocations = (type?: string) =>
  useQuery({
    queryKey: [...queryKeys.consumableLocations, type || 'all'],
    queryFn: () => consumableLocationService.getAll(type),
    staleTime: query.staleTime,
  });

export const useCreateConsumableLocation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ConsumableLocationCreateDto) => consumableLocationService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.consumableLocations });
      toast.success(messages.consumableLocationCreated);
    },
    onError: (error: Error) => {
      toast.error(`${messages.consumableLocationError}: ${error.message}`);
    },
  });
};

export const useUpdateConsumableLocation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ConsumableLocationUpdateDto }) =>
      consumableLocationService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.consumableLocations });
      toast.success(messages.consumableLocationUpdated);
    },
    onError: (error: Error) => {
      toast.error(`${messages.consumableLocationError}: ${error.message}`);
    },
  });
};

export const useDeleteConsumableLocation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => consumableLocationService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.consumableLocations });
      toast.success(messages.consumableLocationDeleted);
    },
    onError: (error: Error) => {
      toast.error(`${messages.consumableLocationError}: ${error.message}`);
    },
  });
};
