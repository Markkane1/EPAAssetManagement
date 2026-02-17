import { useQuery } from '@tanstack/react-query';
import { consumableLotService } from '@/services/consumableLotService';
import type { ConsumableLotFilters } from '@/services/consumableLotService';
import { API_CONFIG } from '@/config/api.config';

const { queryKeys, query } = API_CONFIG;

export const useConsumableLots = (filters?: ConsumableLotFilters) =>
  useQuery({
    queryKey: [...queryKeys.consumableLots, filters || {}],
    queryFn: () => consumableLotService.getAll(filters),
    staleTime: query.staleTime,
  });
