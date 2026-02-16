import api from '@/lib/api';
import authService from '@/services/authService';

export type ActivityType =
  | 'login'
  | 'logout'
  | 'asset_created'
  | 'asset_updated'
  | 'asset_deleted'
  | 'assignment_created'
  | 'assignment_updated'
  | 'transfer_created'
  | 'password_reset_request'
  | 'user_role_changed'
  | 'user_location_changed'
  | 'page_view';

export interface ActivityLog {
  id: string;
  user_id: string;
  activity_type: string;
  description: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface ActivityLogWithUser extends ActivityLog {
  user_email?: string;
  user_name?: string;
}

export interface ActivityListQuery {
  page?: number;
  limit?: number;
  search?: string;
  activityType?: string;
}

export interface PagedActivityResponse {
  items: ActivityLogWithUser[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export const activityService = {
  logActivity: async (activityType: ActivityType, description?: string, metadata?: Record<string, unknown>) => {
    const user = authService.getCurrentUser();
    if (!user) return;
    await api.post('/activities', {
      activityType,
      description,
      metadata,
    });
  },
  logLogin: async () => {
    await activityService.logActivity('login', 'User logged in');
  },
  logLogout: async () => {
    await activityService.logActivity('logout', 'User logged out');
  },
  getRecentActivities: (limit = 50) => api.get<ActivityLogWithUser[]>(`/activities?limit=${limit}`),
  getPagedActivities: (query: ActivityListQuery = {}) => {
    const params = new URLSearchParams();
    params.set('meta', '1');
    if (query.page) params.set('page', String(query.page));
    if (query.limit) params.set('limit', String(query.limit));
    if (query.search && query.search.trim()) params.set('search', query.search.trim());
    if (query.activityType && query.activityType.trim()) params.set('activityType', query.activityType.trim());
    return api.get<PagedActivityResponse>(`/activities?${params.toString()}`);
  },
  getUserActivities: (userId: string, limit = 20) =>
    api.get<ActivityLog[]>(`/activities/user/${userId}?limit=${limit}`),
};

export default activityService;
