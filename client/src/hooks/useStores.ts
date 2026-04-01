import { useQuery } from '@tanstack/react-query';
import { API_CONFIG } from '@/config/api.config';
import { storeService } from '@/services/storeService';

const { queryKeys, query } = API_CONFIG;
const { referenceData } = query.profiles;

export const useStores = () => {
  return useQuery({
    queryKey: queryKeys.stores,
    queryFn: () => storeService.getAll(),
    staleTime: referenceData.staleTime,
    refetchOnWindowFocus: referenceData.refetchOnWindowFocus,
  });
};
