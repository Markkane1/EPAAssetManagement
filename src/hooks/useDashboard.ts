import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '@/services/dashboardService';
import { API_CONFIG } from '@/config/api.config';

const { queryKeys, query } = API_CONFIG;

export const useDashboardStats = () => {
  return useQuery({
    queryKey: [...queryKeys.dashboard, 'stats'],
    queryFn: dashboardService.getStats,
    staleTime: query.staleTime,
  });
};

export const useDashboardData = () => {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: dashboardService.getDashboardData,
    staleTime: query.staleTime,
  });
};

export const useRecentActivity = (limit?: number) => {
  return useQuery({
    queryKey: [...queryKeys.dashboard, 'activity', limit],
    queryFn: () => dashboardService.getRecentActivity(limit),
    staleTime: query.staleTime,
  });
};

export const useAssetsByCategory = () => {
  return useQuery({
    queryKey: [...queryKeys.dashboard, 'assetsByCategory'],
    queryFn: dashboardService.getAssetsByCategory,
    staleTime: query.staleTime,
  });
};

export const useAssetsByStatus = () => {
  return useQuery({
    queryKey: [...queryKeys.dashboard, 'assetsByStatus'],
    queryFn: dashboardService.getAssetsByStatus,
    staleTime: query.staleTime,
  });
};

