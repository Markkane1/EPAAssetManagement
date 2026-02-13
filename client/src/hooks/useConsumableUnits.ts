import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { consumableUnitService } from '@/services/consumableUnitService';
import type {
  ConsumableUnitCreateDto,
  ConsumableUnitUpdateDto,
} from '@/services/consumableUnitService';
import { API_CONFIG } from '@/config/api.config';

const { queryKeys, messages, query } = API_CONFIG;

export const useConsumableUnits = (activeOnly = true) =>
  useQuery({
    queryKey: [...queryKeys.consumableUnits, activeOnly ? 'active' : 'all'],
    queryFn: () => consumableUnitService.getAll(activeOnly),
    staleTime: query.staleTime,
  });

export const useCreateConsumableUnit = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ConsumableUnitCreateDto) => consumableUnitService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.consumableUnits });
      toast.success(messages.consumableUnitCreated);
    },
    onError: (error: Error) => {
      toast.error(`${messages.consumableUnitError}: ${error.message}`);
    },
  });
};

export const useUpdateConsumableUnit = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ConsumableUnitUpdateDto }) =>
      consumableUnitService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.consumableUnits });
      toast.success(messages.consumableUnitUpdated);
    },
    onError: (error: Error) => {
      toast.error(`${messages.consumableUnitError}: ${error.message}`);
    },
  });
};

export const useDeleteConsumableUnit = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => consumableUnitService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.consumableUnits });
      toast.success(messages.consumableUnitDeleted);
    },
    onError: (error: Error) => {
      toast.error(`${messages.consumableUnitError}: ${error.message}`);
    },
  });
};
