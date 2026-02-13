import { useQuery } from '@tanstack/react-query';
import { API_CONFIG } from '@/config/api.config';
import { consumableContainerService } from '@/services/consumableContainerService';
import type { ConsumableContainerFilters } from '@/services/consumableContainerService';

const { queryKeys, query } = API_CONFIG;

export const useConsumableContainers = (filters?: ConsumableContainerFilters) =>
  useQuery({
    queryKey: [...queryKeys.consumableContainers, filters || {}],
    queryFn: () => consumableContainerService.getAll(filters),
    staleTime: query.staleTime,
    enabled: filters !== undefined,
  });
