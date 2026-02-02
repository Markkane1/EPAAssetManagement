import { useQuery } from '@tanstack/react-query';
import { consumableReasonCodeService } from '@/services/consumableReasonCodeService';
import { API_CONFIG } from '@/config/api.config';

const { queryKeys, query } = API_CONFIG;

export const useConsumableReasonCodes = (category?: 'ADJUST' | 'DISPOSE') =>
  useQuery({
    queryKey: [...queryKeys.consumableReasonCodes, category || 'all'],
    queryFn: () => consumableReasonCodeService.getAll(category ? { category } : undefined),
    staleTime: query.staleTime,
  });
