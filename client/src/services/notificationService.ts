import api from '@/lib/api';
import { fetchAllPages } from '@/services/fetchAllPages';

export interface NotificationRecord {
  id: string;
  recipient_user_id: string;
  office_id: string;
  type: string;
  title: string;
  message: string;
  entity_type: string;
  entity_id: string;
  is_read: boolean;
  acknowledged_at?: string | null;
  last_action?: string | null;
  last_action_at?: string | null;
  available_actions?: string[];
  open_path?: string;
  created_at: string;
  updated_at: string;
}

export interface NotificationListResponse {
  data: NotificationRecord[];
  page: number;
  limit: number;
  total: number;
}

export interface NotificationListQuery {
  unreadOnly?: boolean;
  limit?: number;
  page?: number;
}

function buildListQuery(query: NotificationListQuery = {}) {
  const params = new URLSearchParams();
  if (query.unreadOnly !== undefined) {
    params.set('unreadOnly', query.unreadOnly ? 'true' : 'false');
  }
  if (query.limit) params.set('limit', String(query.limit));
  if (query.page) params.set('page', String(query.page));
  return params.toString();
}

export const notificationService = {
  listAll: async (query: NotificationListQuery = {}) => {
    const pageSize = Math.min(100, Math.max(1, query.limit || 100));
    return fetchAllPages(
      query,
      async (pagedQuery) => {
        const response = await notificationService.list({
          ...pagedQuery,
          limit: pageSize,
        });
        return {
          items: response.data,
          page: response.page,
          limit: response.limit,
          total: response.total,
          hasMore: response.page * response.limit < response.total,
        };
      },
      { pageSize }
    );
  },
  list: (query: NotificationListQuery = {}) => {
    const queryString = buildListQuery(query);
    return api.get<NotificationListResponse>(`/notifications${queryString ? `?${queryString}` : ''}`);
  },
  markRead: (id: string) => api.post<NotificationRecord>(`/notifications/${id}/read`),
  markAllRead: () => api.post<{ matched: number; modified: number }>('/notifications/read-all'),
  action: (id: string, payload: { action: 'APPROVE' | 'REJECT' | 'ACKNOWLEDGE' | 'OPEN_RECORD'; decisionNotes?: string }) =>
    api.post<{
      notification: NotificationRecord;
      action: string;
      openPath?: string;
      approval?: unknown;
    }>(`/notifications/${id}/action`, payload),
};

export default notificationService;
