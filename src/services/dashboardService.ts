import api from '@/lib/api';
import { DashboardStats } from '@/types';

export interface DashboardData {
  stats: DashboardStats;
  recentActivity: Array<{
    id: string;
    type: string;
    description: string;
    timestamp: string;
    user?: string;
  }>;
  assetsByCategory: Array<{
    categoryId: string;
    categoryName: string;
    count: number;
    percentage: number;
  }>;
  assetsByStatus: Array<{
    status: string;
    count: number;
    percentage: number;
  }>;
}

export const dashboardService = {
  getStats: () => api.get<DashboardStats>('/dashboard/stats'),
  
  getDashboardData: () => api.get<DashboardData>('/dashboard'),
  
  getRecentActivity: (limit?: number) => 
    api.get<DashboardData['recentActivity']>(`/dashboard/activity${limit ? `?limit=${limit}` : ''}`),
  
  getAssetsByCategory: () => 
    api.get<DashboardData['assetsByCategory']>('/dashboard/assets-by-category'),
  
  getAssetsByStatus: () => 
    api.get<DashboardData['assetsByStatus']>('/dashboard/assets-by-status'),
};

export default dashboardService;

