import api from '@/lib/api';

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
  list: (query: NotificationListQuery = {}) => {
    const queryString = buildListQuery(query);
    return api.get<NotificationListResponse>(`/notifications${queryString ? `?${queryString}` : ''}`);
  },
  markRead: (id: string) => api.post<NotificationRecord>(`/notifications/${id}/read`),
  markAllRead: () => api.post<{ matched: number; modified: number }>('/notifications/read-all'),
};

export default notificationService;
