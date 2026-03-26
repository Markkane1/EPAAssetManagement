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

export interface DashboardMeSummary {
  employeeId: string | null;
  employee: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    directorate_id: string | null;
    location_id: string | null;
  } | null;
  openRequisitionsCount: number;
  openReturnsCount: number;
}

export interface DashboardAdminPanels {
  recentItems: Array<{
    id: string;
    tag: string | null;
    serial_number: string | null;
    item_status: string | null;
    item_condition: string | null;
  }>;
  locations: Array<{
    id: string;
    name: string;
    address: string | null;
    assetCount: number;
  }>;
  storeItemCount: number;
}

function toQueryString(params?: Record<string, unknown>) {
  if (!params) return '';
  const query = Object.entries(params).reduce<Record<string, string>>((acc, [key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      acc[key] = String(value);
    }
    return acc;
  }, {});
  const encoded = new URLSearchParams(query).toString();
  return encoded ? `?${encoded}` : '';
}

export const dashboardService = {
  getStats: () => api.get<DashboardStats>('/dashboard/stats'),
  
  getDashboardData: () => api.get<DashboardData>('/dashboard'),

  getMySummary: () => api.get<DashboardMeSummary>('/dashboard/me'),

  getAdminPanels: (search?: string) =>
    api.get<DashboardAdminPanels>(`/dashboard/panels${toQueryString({ search })}`),
  
  getRecentActivity: (limit?: number) => 
    api.get<DashboardData['recentActivity']>(`/dashboard/activity${limit ? `?limit=${limit}` : ''}`),
  
  getAssetsByCategory: () => 
    api.get<DashboardData['assetsByCategory']>('/dashboard/assets-by-category'),
  
  getAssetsByStatus: () => 
    api.get<DashboardData['assetsByStatus']>('/dashboard/assets-by-status'),
};

export default dashboardService;

