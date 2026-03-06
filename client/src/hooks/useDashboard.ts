import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '@/services/dashboardService';
import { API_CONFIG } from '@/config/api.config';

const { queryKeys, query } = API_CONFIG;

type QueryToggleOptions = {
  enabled?: boolean;
};

export const useDashboardStats = (options: QueryToggleOptions = {}) => {
  const { enabled = true } = options;
  return useQuery({
    queryKey: [...queryKeys.dashboard, 'stats'],
    queryFn: dashboardService.getStats,
    staleTime: query.staleTime,
    enabled,
  });
};

export const useDashboardData = (options: QueryToggleOptions = {}) => {
  const { enabled = true } = options;
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: dashboardService.getDashboardData,
    staleTime: query.staleTime,
    enabled,
  });
};

export const useRecentActivity = (limit?: number, options: QueryToggleOptions = {}) => {
  const { enabled = true } = options;
  return useQuery({
    queryKey: [...queryKeys.dashboard, 'activity', limit],
    queryFn: () => dashboardService.getRecentActivity(limit),
    staleTime: query.staleTime,
    enabled,
  });
};

export const useAssetsByCategory = (options: QueryToggleOptions = {}) => {
  const { enabled = true } = options;
  return useQuery({
    queryKey: [...queryKeys.dashboard, 'assetsByCategory'],
    queryFn: dashboardService.getAssetsByCategory,
    staleTime: query.staleTime,
    enabled,
  });
};

export const useAssetsByStatus = (options: QueryToggleOptions = {}) => {
  const { enabled = true } = options;
  return useQuery({
    queryKey: [...queryKeys.dashboard, 'assetsByStatus'],
    queryFn: dashboardService.getAssetsByStatus,
    staleTime: query.staleTime,
    enabled,
  });
};
