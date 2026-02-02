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

export const activityService = {
  logActivity: async (activityType: ActivityType, description?: string, metadata?: Record<string, unknown>) => {
    const user = authService.getCurrentUser();
    if (!user) return;
    await api.post('/activities', {
      userId: user.id,
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
  getUserActivities: (userId: string, limit = 20) =>
    api.get<ActivityLog[]>(`/activities/user/${userId}?limit=${limit}`),
};

export default activityService;
