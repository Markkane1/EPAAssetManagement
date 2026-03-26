import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '@/services/dashboardService';
import { API_CONFIG } from '@/config/api.config';

const { queryKeys, query } = API_CONFIG;
const { dashboard, live } = query.profiles;

type QueryToggleOptions = {
  enabled?: boolean;
};

export const useDashboardStats = (options: QueryToggleOptions = {}) => {
  const { enabled = true } = options;
  return useQuery({
    queryKey: [...queryKeys.dashboard, 'stats'],
    queryFn: dashboardService.getStats,
    staleTime: dashboard.staleTime,
    refetchOnWindowFocus: dashboard.refetchOnWindowFocus,
    enabled,
  });
};

export const useDashboardData = (options: QueryToggleOptions = {}) => {
  const { enabled = true } = options;
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: dashboardService.getDashboardData,
    staleTime: dashboard.staleTime,
    refetchOnWindowFocus: dashboard.refetchOnWindowFocus,
    enabled,
  });
};

export const useDashboardMe = (options: QueryToggleOptions = {}) => {
  const { enabled = true } = options;
  return useQuery({
    queryKey: [...queryKeys.dashboard, 'me'],
    queryFn: dashboardService.getMySummary,
    staleTime: dashboard.staleTime,
    refetchOnWindowFocus: dashboard.refetchOnWindowFocus,
    enabled,
  });
};

export const useDashboardPanels = (search?: string, options: QueryToggleOptions = {}) => {
  const { enabled = true } = options;
  return useQuery({
    queryKey: [...queryKeys.dashboard, 'panels', search || ''],
    queryFn: () => dashboardService.getAdminPanels(search),
    staleTime: dashboard.staleTime,
    refetchOnWindowFocus: dashboard.refetchOnWindowFocus,
    enabled,
  });
};

export const useRecentActivity = (limit?: number, options: QueryToggleOptions = {}) => {
  const { enabled = true } = options;
  return useQuery({
    queryKey: [...queryKeys.dashboard, 'activity', limit],
    queryFn: () => dashboardService.getRecentActivity(limit),
    staleTime: live.staleTime,
    refetchOnWindowFocus: live.refetchOnWindowFocus,
    enabled,
  });
};

export const useAssetsByCategory = (options: QueryToggleOptions = {}) => {
  const { enabled = true } = options;
  return useQuery({
    queryKey: [...queryKeys.dashboard, 'assetsByCategory'],
    queryFn: dashboardService.getAssetsByCategory,
    staleTime: dashboard.staleTime,
    refetchOnWindowFocus: dashboard.refetchOnWindowFocus,
    enabled,
  });
};

export const useAssetsByStatus = (options: QueryToggleOptions = {}) => {
  const { enabled = true } = options;
  return useQuery({
    queryKey: [...queryKeys.dashboard, 'assetsByStatus'],
    queryFn: dashboardService.getAssetsByStatus,
    staleTime: dashboard.staleTime,
    refetchOnWindowFocus: dashboard.refetchOnWindowFocus,
    enabled,
  });
};
