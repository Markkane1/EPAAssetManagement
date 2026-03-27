import { useQuery } from '@tanstack/react-query';
import { API_CONFIG } from '@/config/api.config';
import { reportService } from '@/services/reportService';
import type { NonComplianceReportParams } from '@/services/reportService';

const { query } = API_CONFIG;
const { heavyList } = query.profiles;

export const useNonComplianceReport = (params: NonComplianceReportParams = {}, enabled = true) =>
  useQuery({
    queryKey: [
      'compliance',
      params.officeId || 'all-offices',
      params.from || '',
      params.to || '',
      params.page ?? 1,
      params.limit ?? null,
    ],
    queryFn: () => reportService.getNonCompliance(params),
    staleTime: heavyList.staleTime,
    refetchOnWindowFocus: heavyList.refetchOnWindowFocus,
    enabled,
  });
